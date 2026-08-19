"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

type MovementKeys = {
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
  shift: boolean;
};

type OrientationPermission = "granted" | "denied";
type DeviceOrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<OrientationPermission>;
};

// ============================================
//  漫游调参区
//  修改操作手感、相机、灯光或初始视角时，优先只调整这里。
// ============================================
const VIEWER_CONFIG = {
  scene: {
    backgroundColor: 0xc8dae6, // 场景背景色。
  },
  camera: {
    fieldOfView: 75, // 相机视野角度；数值越大，看到的范围越广。
    nearPlane: 0.1, // 最近可见距离；过大会裁掉贴近相机的物体。
    farPlane: 2000, // 最远可见距离；需要覆盖整个模型。
    initialPosition: [0, 80, 60] as const, // 模型加载前的临时相机位置。
    initialPitch: -0.4, // 模型加载前的初始俯视角，单位为弧度。
    maxPitch: Math.PI / 2.2, // 上下转头的最大角度，防止镜头完全翻转。
    eyeOffset: 18, // 相机距离模型地面的最低高度，防止穿入地下。
  },
  movement: {
    desktopSpeed: 0.07, // 电脑端 WASD 每帧移动速度。
    mobileSpeed: 0.09, // 手机端摇杆每帧基础移动速度。
    boostMultiplier: 2.5, // Shift 或摇杆推满时的最高加速倍数。
    mouseLookSensitivity: 0.0015, // 鼠标拖拽转向灵敏度；越大转动越快。
    wheelHeightSensitivity: 0.08, // 鼠标滚轮升降灵敏度；越大升降越快。
  },
  renderer: {
    antialias: true, // 是否启用抗锯齿。
    exposure: 1.8, // 整体曝光强度；越大画面越亮。
    shadows: true, // 是否启用阴影计算。
  },
  lighting: {
    mainColor: 0xffffff, // 主光颜色。
    mainIntensity: 2.8, // 主光强度。
    mainPosition: [50, 80, 30] as const, // 主光位置。
    ambientColor: 0xffffff, // 环境光颜色。
    ambientIntensity: 0.8, // 环境光强度，主要影响暗部亮度。
    fillColor: 0xfff8e8, // 补光颜色，略偏暖色。
    fillIntensity: 3, // 补光强度。
    fillPosition: [-40, 60, -40] as const, // 补光位置，用于照亮建筑背面。
  },
  model: {
    url: "/models/PARLIAMENT%202.glb", // public 目录下的 GLB 模型访问路径。
    eyeHeightRatio: 0.18, // 初始相机高度占模型高度的比例。
    minimumEyeClearance: 0.4, // 初始相机高于最低安全高度的额外距离。
    viewDistanceRatio: 0.55, // 初始观察距离占模型最大尺寸的比例。
    cameraOffsetX: -55, // 初始相机相对模型中心的 X 偏移。
    cameraOffsetY: -4, // 初始相机相对计算高度的 Y 偏移。
    cameraOffsetZ: 50, // 初始相机相对计算距离的 Z 偏移。
    targetOffsetX: 400, // 初始视线目标相对模型中心的 X 偏移。
    targetHeightRatio: 0.2, // 初始视线目标高度占模型高度的比例。
    targetOffsetZ: -100, // 初始视线目标相对模型中心的 Z 偏移。
  },
  joystick: {
    radius: 48, // 摇杆圆点允许移动的最大半径，单位为像素。
    deadZone: 0.18, // 摇杆死区比例，避免轻微触碰导致误移动。
  },
} as const;

const createMovementKeys = (): MovementKeys => ({
  w: false,
  s: false,
  a: false,
  d: false,
  shift: false,
});

function isMovementKey(key: string): key is keyof MovementKeys {
  return key === "w" || key === "s" || key === "a" || key === "d" || key === "shift";
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}

export default function MonasteryViewer() {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const resetCameraRef = useRef<() => void>(() => undefined);
  const keysRef = useRef<MovementKeys>(createMovementKeys());
  const joystickStrengthRef = useRef(0);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [loadStatus, setLoadStatus] = useState("正在加载三维模型…");
  const [loadFailed, setLoadFailed] = useState(false);
  const [gyroStatus, setGyroStatus] = useState("陀螺仪：未启用");

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
    setIsMobileDevice(mobile);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(VIEWER_CONFIG.scene.backgroundColor);

    const camera = new THREE.PerspectiveCamera(
      VIEWER_CONFIG.camera.fieldOfView,
      window.innerWidth / window.innerHeight,
      VIEWER_CONFIG.camera.nearPlane,
      VIEWER_CONFIG.camera.farPlane,
    );
    camera.position.set(...VIEWER_CONFIG.camera.initialPosition);

    const renderer = new THREE.WebGLRenderer({ antialias: VIEWER_CONFIG.renderer.antialias });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = VIEWER_CONFIG.renderer.exposure;
    renderer.shadowMap.enabled = VIEWER_CONFIG.renderer.shadows;
    host.appendChild(renderer.domElement);

    const keys = keysRef.current;
    let floorMinY = 0;
    let yaw = 0;
    let pitch: number = VIEWER_CONFIG.camera.initialPitch;
    let isMouseDown = false;
    let useGyro = false;
    let gyroReady = false;
    let gyroCalibrated = false;
    let gyroYawOffset = 0;
    let gyroPitchOffset = 0;
    let disposed = false;
    let animationFrame = 0;
    const initialCameraPosition = new THREE.Vector3();
    let initialYaw = 0;
    let initialPitch = 0;

    // 根据目标点反解视角，避免模型加载完成后镜头突然跳变。
    const syncViewAnglesToTarget = (target: THREE.Vector3) => {
      const direction = new THREE.Vector3().subVectors(target, camera.position).normalize();
      yaw = Math.atan2(-direction.x, -direction.z);
      pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
      pitch = THREE.MathUtils.clamp(
        pitch,
        -VIEWER_CONFIG.camera.maxPitch,
        VIEWER_CONFIG.camera.maxPitch,
      );
    };

    const limitCameraHeight = () => {
      camera.position.y = Math.max(camera.position.y, floorMinY + VIEWER_CONFIG.camera.eyeOffset);
    };

    const resetCamera = () => {
      camera.position.copy(initialCameraPosition);
      yaw = initialYaw;
      pitch = initialPitch;
      Object.assign(keys, createMovementKeys());
      joystickStrengthRef.current = 0;
      if (joystickKnobRef.current) {
        joystickKnobRef.current.style.transform = "translate(-50%, -50%)";
      }
      gyroYawOffset = 0;
      gyroPitchOffset = 0;
      gyroCalibrated = false;
    };
    resetCameraRef.current = resetCamera;

    const onMouseDown = () => {
      isMouseDown = true;
    };
    const onMouseUp = () => {
      isMouseDown = false;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!isMouseDown || useGyro) return;
      yaw += event.movementX * VIEWER_CONFIG.movement.mouseLookSensitivity;
      pitch += event.movementY * VIEWER_CONFIG.movement.mouseLookSensitivity;
      pitch = THREE.MathUtils.clamp(
        pitch,
        -VIEWER_CONFIG.camera.maxPitch,
        VIEWER_CONFIG.camera.maxPitch,
      );
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.position.y -= event.deltaY * VIEWER_CONFIG.movement.wheelHeightSensitivity;
      limitCameraHeight();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (isMovementKey(key)) keys[key] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (isMovementKey(key)) keys[key] = false;
    };
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      const { alpha, beta, gamma } = event;
      if (alpha === null || beta === null || gamma === null) return;

      setGyroStatus("陀螺仪：数据正常");
      if (!gyroCalibrated) {
        gyroYawOffset = THREE.MathUtils.degToRad(alpha);
        gyroPitchOffset = THREE.MathUtils.degToRad(beta);
        gyroCalibrated = true;
      }

      yaw = THREE.MathUtils.degToRad(alpha) - gyroYawOffset;
      pitch = -(THREE.MathUtils.degToRad(beta) - gyroPitchOffset);
      pitch = THREE.MathUtils.clamp(
        pitch,
        -VIEWER_CONFIG.camera.maxPitch,
        VIEWER_CONFIG.camera.maxPitch,
      );
    };

    const bindGyro = () => {
      if (gyroReady) return;
      window.addEventListener("deviceorientation", onOrientation, { passive: true });
      window.addEventListener("deviceorientationabsolute", onOrientation, { passive: true });
      useGyro = true;
      gyroReady = true;
      setGyroStatus("陀螺仪：已监听");
    };

    const activateGyro = async () => {
      if (!mobile || gyroReady || typeof window.DeviceOrientationEvent === "undefined") return;

      const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (!window.isSecureContext && !isLocalhost) {
        setGyroStatus("陀螺仪：需要 HTTPS 或 localhost");
        return;
      }

      const orientationEvent = DeviceOrientationEvent as DeviceOrientationEventConstructor;
      if (!orientationEvent.requestPermission) {
        bindGyro();
        return;
      }

      try {
        setGyroStatus("陀螺仪：请求权限中");
        const permission = await orientationEvent.requestPermission();
        if (permission === "granted") {
          bindGyro();
        } else {
          setGyroStatus("陀螺仪：权限被拒绝");
        }
      } catch (error) {
        console.error("陀螺仪权限请求失败：", error);
        setGyroStatus("陀螺仪：请求失败");
      }
    };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("pointerdown", activateGyro, { passive: true });
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    const directionalLight = new THREE.DirectionalLight(
      VIEWER_CONFIG.lighting.mainColor,
      VIEWER_CONFIG.lighting.mainIntensity,
    );
    directionalLight.position.set(...VIEWER_CONFIG.lighting.mainPosition);
    scene.add(directionalLight);
    scene.add(
      new THREE.AmbientLight(
        VIEWER_CONFIG.lighting.ambientColor,
        VIEWER_CONFIG.lighting.ambientIntensity,
      ),
    );

    const fillLight = new THREE.DirectionalLight(
      VIEWER_CONFIG.lighting.fillColor,
      VIEWER_CONFIG.lighting.fillIntensity,
    );
    fillLight.position.set(...VIEWER_CONFIG.lighting.fillPosition);
    scene.add(fillLight);

    const loader = new GLTFLoader();
    loader.load(
      VIEWER_CONFIG.model.url,
      (gltf) => {
        const model = gltf.scene;
        if (disposed) {
          disposeObject(model);
          return;
        }

        const initialBox = new THREE.Box3().setFromObject(model);
        const center = initialBox.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // 居中后重新计算包围盒，保证地面高度与模型真实坐标一致。
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const centeredCenter = box.getCenter(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z);
        floorMinY = box.min.y;

        const eyeHeight = Math.max(
          VIEWER_CONFIG.camera.eyeOffset + VIEWER_CONFIG.model.minimumEyeClearance,
          size.y * VIEWER_CONFIG.model.eyeHeightRatio,
        );
        const viewDistance = maxDimension * VIEWER_CONFIG.model.viewDistanceRatio;
        camera.position.set(
          centeredCenter.x + VIEWER_CONFIG.model.cameraOffsetX,
          floorMinY + eyeHeight + VIEWER_CONFIG.model.cameraOffsetY,
          -(centeredCenter.z + viewDistance) + VIEWER_CONFIG.model.cameraOffsetZ,
        );

        const lookTarget = new THREE.Vector3(
          centeredCenter.x + VIEWER_CONFIG.model.targetOffsetX,
          floorMinY + size.y * VIEWER_CONFIG.model.targetHeightRatio,
          centeredCenter.z + VIEWER_CONFIG.model.targetOffsetZ,
        );
        syncViewAnglesToTarget(lookTarget);
        initialCameraPosition.copy(camera.position);
        initialYaw = yaw;
        initialPitch = pitch;
        scene.add(model);
        setLoadStatus("模型加载完成");
        setModelReady(true);
      },
      (progress) => {
        if (!disposed && progress.total > 0) {
          const percent = ((progress.loaded / progress.total) * 100).toFixed(1);
          setLoadStatus(`正在加载三维模型：${percent}%`);
        }
      },
      (error) => {
        if (disposed) return;
        console.error("模型加载失败：", error);
        setLoadFailed(true);
        setLoadStatus("模型加载失败，请检查 public/models 中的 GLB 文件。");
      },
    );

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const animate = () => {
      const currentMoveSpeed = mobile
        ? VIEWER_CONFIG.movement.mobileSpeed *
          (1 +
            joystickStrengthRef.current * (VIEWER_CONFIG.movement.boostMultiplier - 1))
        : VIEWER_CONFIG.movement.desktopSpeed *
          (keys.shift ? VIEWER_CONFIG.movement.boostMultiplier : 1);

      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(camera.up, forward).normalize();

      if (keys.w) camera.position.addScaledVector(forward, currentMoveSpeed);
      if (keys.s) camera.position.addScaledVector(forward, -currentMoveSpeed);
      if (keys.a) camera.position.addScaledVector(right, currentMoveSpeed);
      if (keys.d) camera.position.addScaledVector(right, -currentMoveSpeed);

      limitCameraHeight();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resetCameraRef.current = () => undefined;
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("wheel", onWheel);
      host.removeEventListener("pointerdown", activateGyro);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("deviceorientationabsolute", onOrientation);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  const updateJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const joystick = event.currentTarget;
    const knob = joystickKnobRef.current;
    if (!knob) return;

    const rect = joystick.getBoundingClientRect();
    const { radius, deadZone } = VIEWER_CONFIG.joystick;
    let offsetX = event.clientX - (rect.left + rect.width / 2);
    let offsetY = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(offsetX, offsetY);
    if (distance > radius) {
      const scale = radius / distance;
      offsetX *= scale;
      offsetY *= scale;
    }

    knob.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    const normalizedX = offsetX / radius;
    const normalizedY = offsetY / radius;
    const normalizedDistance = Math.min(distance / radius, 1);
    joystickStrengthRef.current = Math.max(0, (normalizedDistance - deadZone) / (1 - deadZone));
    keysRef.current.w = normalizedY < -deadZone;
    keysRef.current.s = normalizedY > deadZone;
    keysRef.current.a = normalizedX < -deadZone;
    keysRef.current.d = normalizedX > deadZone;
  };

  const resetJoystick = () => {
    joystickStrengthRef.current = 0;
    keysRef.current.w = false;
    keysRef.current.s = false;
    keysRef.current.a = false;
    keysRef.current.d = false;
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = "translate(-50%, -50%)";
    }
  };

  return (
    <section className="viewer-shell" aria-label="修道院三维虚拟漫游">
      <div ref={canvasHostRef} className="viewer-canvas" />

      <button
        className="viewer-control reset-button"
        type="button"
        disabled={!modelReady}
        onClick={() => resetCameraRef.current()}
      >
        重置
      </button>

      {isMobileDevice && <div className="viewer-control gyro-status">{gyroStatus}</div>}

      {!modelReady && (
        <div className="loading-status" data-error={loadFailed} role={loadFailed ? "alert" : "status"}>
          {loadStatus}
        </div>
      )}

      {isMobileDevice && (
        <div
          className="joystick"
          aria-label="移动摇杆"
          role="application"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            updateJoystick(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updateJoystick(event);
          }}
          onPointerUp={resetJoystick}
          onPointerCancel={resetJoystick}
        >
          <div ref={joystickKnobRef} className="joystick-knob" />
        </div>
      )}
    </section>
  );
}
