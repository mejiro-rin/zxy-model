"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MODEL_SOURCE_BASE } from "./model-source";

type MovementKeys = {
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
  shift: boolean;
};

type LoadStage = "初始化" | "下载模型" | "解析与场景构建" | "渲染就绪" | "加载失败";

type OrientationPermission = "granted" | "denied";
type DeviceOrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<OrientationPermission>;
};
type DeviceMotionEventConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<OrientationPermission>;
};

// ============================================
//  漫游调参区
//  修改操作手感、相机、灯光或初始视角时，优先只调整这里。
//  每个模型一个配置对象（对象名与模型文件名一致），
//  新增模型时复制一份 MODEL_CONFIGS 中的条目并修改 url 与参数即可，
//  再在 ACTIVE_MODEL_NAME 切换当前加载的模型。
// ============================================
const MODEL_CONFIGS = {
  parliament2: {
    url: "/models/PARLIAMENT2.glb", // public 目录下的 GLB 模型访问路径。
    displayName: "议会大厦", // 模型显示名称。
    scale: 1, // 模型渲染缩放比例；1 表示不缩放。
    camera: {
      initialPosition: [0, 80, 60] as const, // 模型加载前的临时相机位置。
      initialPitch: 0, // 模型加载前的初始俯视角，单位为弧度。
      eyeOffset: 18, // 相机距离模型地面的最低安全高度，防止穿入地下。
      eyeHeightRatio: 0.18, // 初始相机高度占模型高度的比例。
      minimumEyeClearance: 0.4, // 初始相机高于最低安全高度的额外距离。
      viewDistanceRatio: 0.55, // 初始观察距离占模型最大尺寸的比例。
      cameraOffsetX: -55, // 初始相机相对模型中心的 X 偏移。
      cameraOffsetY: -10, // 初始相机相对计算高度的 Y 偏移。
      cameraOffsetZ: -400, // 初始相机相对计算距离的 Z 偏移。
      targetOffsetX: 400, // 初始视线目标相对模型中心的 X 偏移。
      targetHeightRatio: 0.2, // 初始视线目标高度占模型高度的比例。
      targetOffsetZ: -100, // 初始视线目标相对模型中心的 Z 偏移。
    },
    movement: {
      desktopSpeed: 0.15, // 电脑端 WASD 每帧移动速度。
      mobileSpeed: 0.15, // 手机端摇杆每帧基础移动速度。
      verticalSpeed: 0.15, // 电脑端上下飞行每帧移动速度。
      mobileVerticalSpeed: 0.15, // 手机端上下飞行每帧基础移动速度。
    },
  },
  stp_stourton: {
    url: "/models/stp_stourton.glb",
    displayName: "圣彼得教堂",
    scale: 2,
    camera: {
      initialPosition: [0, 80, 60] as const, // 模型加载前的临时相机位置。
      initialPitch: 0, // 模型加载前的初始俯视角，单位为弧度。
      eyeOffset: 3.5, // 相机距离模型地面的最低安全高度，防止穿入地下。
      eyeHeightRatio: 0.18, // 初始相机高度占模型高度的比例。
      minimumEyeClearance: 0, // 初始相机高于最低安全高度的额外距离。
      viewDistanceRatio: 0.55, // 初始观察距离占模型最大尺寸的比例。
      cameraOffsetX: 3.7, // 初始相机相对模型中心的 X 偏移。
      cameraOffsetY: 0, // 初始相机相对计算高度的 Y 偏移。
      cameraOffsetZ: -12, // 初始相机相对计算距离的 Z 偏移。
      targetOffsetX: 0, // 初始视线目标相对模型中心的 X 偏移。
      targetHeightRatio: 0.2, // 初始视线目标高度占模型高度的比例。
      targetOffsetZ: -120, // 初始视线目标相对模型中心的 Z 偏移。
    },
    movement: {
      desktopSpeed: 0.10, // 电脑端 WASD 每帧移动速度。
      mobileSpeed: 0.12, // 手机端摇杆每帧基础移动速度。
      verticalSpeed: 0.15, // 电脑端上下飞行每帧移动速度。
      mobileVerticalSpeed: 0.15, // 手机端上下飞行每帧基础移动速度。
    },
  },
  stb_the_less: {
    url: "/models/stb_the_less.glb",
    displayName: "伦敦史密斯菲尔德教堂",
    scale: 1.5,
    camera: {
      initialPosition: [0, 80, 60] as const, // 模型加载前的临时相机位置。
      initialPitch: 0, // 模型加载前的初始俯视角，单位为弧度。
      eyeOffset: 4, // 相机距离模型地面的最低安全高度，防止穿入地下。
      eyeHeightRatio: 0.18, // 初始相机高度占模型高度的比例。
      minimumEyeClearance: 0, // 初始相机高于最低安全高度的额外距离。
      viewDistanceRatio: 0.55, // 初始观察距离占模型最大尺寸的比例。
      cameraOffsetX: 2, // 初始相机相对模型中心的 X 偏移。
      cameraOffsetY: 0, // 初始相机相对计算高度的 Y 偏移。
      cameraOffsetZ: -24.5, // 初始相机相对计算距离的 Z 偏移。
      targetOffsetX: 0, // 初始视线目标相对模型中心的 X 偏移。
      targetHeightRatio: 0.21, // 初始视线目标高度占模型高度的比例。
      targetOffsetZ: 0, // 初始视线目标相对模型中心的 Z 偏移。
    },
    movement: {
      desktopSpeed: 0.10, // 电脑端 WASD 每帧移动速度。
      mobileSpeed: 0.12, // 手机端摇杆每帧基础移动速度。
      verticalSpeed: 0.15, // 电脑端上下飞行每帧移动速度。
      mobileVerticalSpeed: 0.15, // 手机端上下飞行每帧基础移动速度。
    },
  },
} as const;

// 当前加载的模型名称（MODEL_CONFIGS 的键名），初始化时按此名称取用对应配置。
const ACTIVE_MODEL_NAME: keyof typeof MODEL_CONFIGS = "stb_the_less";

type ModelConfig = (typeof MODEL_CONFIGS)[keyof typeof MODEL_CONFIGS];
const getModelConfig = (name: keyof typeof MODEL_CONFIGS): ModelConfig => MODEL_CONFIGS[name];

// 全局通用配置（不随模型变化的参数）。
const VIEWER_CONFIG = {
  scene: {
    backgroundColor: 0xc8dae6, // 场景背景色。
  },
  camera: {
    fieldOfView: 75, // 相机视野角度；数值越大，看到的范围越广。
    nearPlane: 0.1, // 最近可见距离；过大会裁掉贴近相机的物体。
    farPlane: 2000, // 最远可见距离；需要覆盖整个模型。
    maxPitch: Math.PI / 2.2, // 上下转头的最大角度，防止镜头完全翻转。
  },
  movement: {
    boostMultiplier: 2.5, // Shift 或摇杆推满时的最高加速倍数。
    mouseLookSensitivity: 0.0015, // 鼠标拖拽转向灵敏度；越大转动越快。
    wheelHeightSensitivity: 0.08, // 鼠标滚轮升降灵敏度；越大升降越快。
  },
  renderer: {
    antialias: true, // 是否启用抗锯齿。
    exposure: 3, // 整体曝光强度；越大画面越亮。
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
  joystick: {
    radius: 48, // 摇杆圆点允许移动的最大半径，单位为像素。
    deadZone: 0.18, // 摇杆死区比例，避免轻微触碰导致误移动。
  },
  collision: {
    enabled: true, // 是否启用碰撞体积（基于模型三角面构建的网格）。
    cellSize: 8, // 碰撞网格单元大小，越小精度越高、构建越慢。
    radius: 1.2, // 相机碰撞半径，越大越容易被墙体阻挡。
    wallNormalMax: 0.5, // 仅近似垂直（墙体类）的三角面参与横向碰撞，避免地面挡路。
  },
} as const;

// 组件内统一使用当前模型配置（初始化时按模型名称加载）。
const modelConfig = getModelConfig(ACTIVE_MODEL_NAME);

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

// 基于模型三角面构建的均匀网格碰撞体。
// 构建时把每个三角形按包围盒写入其经过的网格单元，
// 查询时只检测相机附近网格单元中的三角面，避免每帧对全模型做射线检测。
class CollisionGrid {
  private readonly cellSize: number;
  private readonly cells = new Map<string, number[]>();
  private readonly triangles: Float32Array;
  private readonly tempA = new THREE.Vector3();
  private readonly tempB = new THREE.Vector3();
  private readonly tempC = new THREE.Vector3();
  private readonly tempTriangle = new THREE.Triangle();
  private readonly tempClosest = new THREE.Vector3();

  constructor(root: THREE.Object3D, cellSize: number) {
    this.cellSize = cellSize;
    root.updateMatrixWorld(true);

    const flat: number[] = [];
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const normal = new THREE.Vector3();

    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry?.getAttribute?.("position");
      if (!position) return;
      const index = mesh.geometry.getIndex();
      const triCount = index ? index.count / 3 : position.count / 3;
      const matrix = mesh.matrixWorld;

      for (let i = 0; i < triCount; i++) {
        const ia = index ? index.getX(i * 3) : i * 3;
        const ib = index ? index.getX(i * 3 + 1) : i * 3 + 1;
        const ic = index ? index.getX(i * 3 + 2) : i * 3 + 2;
        va.set(position.getX(ia), position.getY(ia), position.getZ(ia)).applyMatrix4(matrix);
        vb.set(position.getX(ib), position.getY(ib), position.getZ(ib)).applyMatrix4(matrix);
        vc.set(position.getX(ic), position.getY(ic), position.getZ(ic)).applyMatrix4(matrix);
        edge1.subVectors(vb, va);
        edge2.subVectors(vc, va);
        normal.crossVectors(edge1, edge2).normalize();
        flat.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z, normal.x, normal.y, normal.z);
      }
    });

    this.triangles = new Float32Array(flat);
    const triCount = this.triangles.length / 12;

    for (let t = 0; t < triCount; t++) {
      const o = t * 12;
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let v = 0; v < 3; v++) {
        const x = this.triangles[o + v * 3];
        const y = this.triangles[o + v * 3 + 1];
        const z = this.triangles[o + v * 3 + 2];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      const ix0 = Math.floor(minX / cellSize);
      const ix1 = Math.floor(maxX / cellSize);
      const iy0 = Math.floor(minY / cellSize);
      const iy1 = Math.floor(maxY / cellSize);
      const iz0 = Math.floor(minZ / cellSize);
      const iz1 = Math.floor(maxZ / cellSize);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iy = iy0; iy <= iy1; iy++) {
          for (let iz = iz0; iz <= iz1; iz++) {
            const key = `${ix},${iy},${iz}`;
            const list = this.cells.get(key);
            if (list) list.push(t);
            else this.cells.set(key, [t]);
          }
        }
      }
    }
  }

  // 检测目标点是否贴近墙体类三角面（仅横向碰撞用）。
  isLateralBlocked(moved: THREE.Vector3, radius: number, wallNormalMax: number): boolean {
    const cell = this.cellSize;
    const ix0 = Math.floor((moved.x - radius) / cell);
    const ix1 = Math.floor((moved.x + radius) / cell);
    const iy0 = Math.floor((moved.y - radius) / cell);
    const iy1 = Math.floor((moved.y + radius) / cell);
    const iz0 = Math.floor((moved.z - radius) / cell);
    const iz1 = Math.floor((moved.z + radius) / cell);
    const radiusSq = radius * radius;

    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const list = this.cells.get(`${ix},${iy},${iz}`);
          if (!list) continue;
          for (const t of list) {
            const o = t * 12;
            if (Math.abs(this.triangles[o + 11]) > wallNormalMax) continue;
            this.tempA.set(this.triangles[o], this.triangles[o + 1], this.triangles[o + 2]);
            this.tempB.set(this.triangles[o + 3], this.triangles[o + 4], this.triangles[o + 5]);
            this.tempC.set(this.triangles[o + 6], this.triangles[o + 7], this.triangles[o + 8]);
            this.tempTriangle.set(this.tempA, this.tempB, this.tempC);
            this.tempTriangle.closestPointToPoint(moved, this.tempClosest);
            if (this.tempClosest.distanceToSquared(moved) < radiusSq) return true;
          }
        }
      }
    }
    return false;
  }
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
  const activateGyroRef = useRef<() => void>(() => undefined);
  const keysRef = useRef<MovementKeys>(createMovementKeys());
  const joystickStrengthRef = useRef(0);
  const risePressedRef = useRef(false);
  const descendPressedRef = useRef(false);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const coordsHudRef = useRef<HTMLDivElement>(null);
  const showCoordsRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [loadStage, setLoadStage] = useState<LoadStage>("初始化");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [decodeProgress, setDecodeProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [loadLogs, setLoadLogs] = useState<string[]>(["初始化 Viewer 组件"]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [gyroStatus, setGyroStatus] = useState("陀螺仪：未启用");
  const [canEnableGyro, setCanEnableGyro] = useState(false);

  const addLoadLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLoadLogs((logs) => [...logs, `${time} ${message}`].slice(-6));
  }, []);

  const updateLoadState = useCallback((
    stage: LoadStage,
    download: number,
    decode: number,
    message?: string,
  ) => {
    const nextDownload = Math.min(100, Math.max(0, download));
    const nextDecode = Math.min(100, Math.max(0, decode));
    setLoadStage(stage);
    setDownloadProgress(nextDownload);
    setDecodeProgress(nextDecode);
    setOverallProgress(nextDownload * 0.7 + nextDecode * 0.3);
    if (message) addLoadLog(message);
  }, [addLoadLog]);

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
    camera.position.set(...(modelConfig.camera.initialPosition as [number, number, number]));

    const renderer = new THREE.WebGLRenderer({ antialias: VIEWER_CONFIG.renderer.antialias });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = VIEWER_CONFIG.renderer.exposure;
    renderer.shadowMap.enabled = VIEWER_CONFIG.renderer.shadows;
    host.appendChild(renderer.domElement);

    const keys = keysRef.current;
    let floorMinY = 0;
    let collisionGrid: CollisionGrid | null = null;
    let yaw = 0;
    let pitch: number = modelConfig.camera.initialPitch;
    let isMouseDown = false;
    let useGyro = false;
    let gyroReady = false;
    let gyroCalibrated = false;
    let gyroYawOffset = 0;
    let gyroPitchOffset = 0;
    let gyroPermissionPending = false;
    let orientationSource: "unknown" | "relative" | "absolute" = "unknown";
    let sawRelativeOrientationEvent = false;
    let orientationSourceLockFrame = 0;
    let lastGyroStatus: string | null = null;
    let disposed = false;
    let animationFrame = 0;
    let loadProgressFrame = 0;
    const initialCameraPosition = new THREE.Vector3();
    let initialYaw = 0;
    let initialPitch = 0;
    const gyroEuler = new THREE.Euler();
    const gyroQuaternion = new THREE.Quaternion();
    const gyroScreenQuaternion = new THREE.Quaternion();
    const gyroAxisZ = new THREE.Vector3(0, 0, 1);
    const gyroForward = new THREE.Vector3(0, 0, -1);
    const worldAdjustQuaternion = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

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
      camera.position.y = Math.max(camera.position.y, floorMinY + modelConfig.camera.eyeOffset);
    };

    const resetCamera = () => {
      camera.position.copy(initialCameraPosition);
      yaw = initialYaw;
      pitch = initialPitch;
      Object.assign(keys, createMovementKeys());
      joystickStrengthRef.current = 0;
      risePressedRef.current = false;
      descendPressedRef.current = false;
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

    const reportGyroStatus = (status: string) => {
      if (lastGyroStatus !== status) {
        lastGyroStatus = status;
        setGyroStatus(status);
      }
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      const { alpha, beta, gamma, absolute } = event;
      if (alpha === null || beta === null || gamma === null) return;

      // 部分安卓设备会对同一份传感器样本同时触发 deviceorientation 与
      // deviceorientationabsolute 两个事件，且两者的 alpha 存在常量偏差，
      // 若都参与计算，视角会在两个角度之间来回闪烁。这里锁定单一数据源：
      // 优先使用 absolute 事件；仅当确认设备不提供 absolute（如 iOS）时，
      // 才在下一帧回退到相对事件。
      if (orientationSource === "unknown") {
        if (absolute === true) {
          orientationSource = "absolute";
          if (orientationSourceLockFrame) cancelAnimationFrame(orientationSourceLockFrame);
        } else if (!sawRelativeOrientationEvent) {
          sawRelativeOrientationEvent = true;
          if (orientationSourceLockFrame) cancelAnimationFrame(orientationSourceLockFrame);
          orientationSourceLockFrame = requestAnimationFrame(() => {
            if (orientationSource === "unknown") orientationSource = "relative";
          });
        }
      }

      if (orientationSource === "unknown") return;
      if (orientationSource === "absolute" && absolute !== true) return;
      if (orientationSource === "relative" && absolute === true) return;

      reportGyroStatus("陀螺仪：数据正常");

      const alphaRad = THREE.MathUtils.degToRad(alpha);
      const betaRad = THREE.MathUtils.degToRad(beta);
      const gammaRad = THREE.MathUtils.degToRad(gamma);

      const legacyOrientation = typeof (window as { orientation?: number }).orientation === "number"
        ? (window as { orientation?: number }).orientation ?? 0
        : 0;
      const screenOrientationDeg = window.screen.orientation?.angle ?? legacyOrientation;
      const screenOrientationRad = THREE.MathUtils.degToRad(screenOrientationDeg);

      // 参考 three 设备方向控制的姿态换算，处理横竖屏与坐标系差异。
      gyroEuler.set(betaRad, alphaRad, -gammaRad, "YXZ");
      gyroQuaternion.setFromEuler(gyroEuler);
      gyroQuaternion.multiply(worldAdjustQuaternion);
      gyroQuaternion.multiply(gyroScreenQuaternion.setFromAxisAngle(gyroAxisZ, -screenOrientationRad));

      gyroForward.set(0, 0, -1).applyQuaternion(gyroQuaternion).normalize();
      const nextYaw = Math.atan2(-gyroForward.x, -gyroForward.z);
      const nextPitch = Math.asin(THREE.MathUtils.clamp(gyroForward.y, -1, 1));

      if (!gyroCalibrated) {
        gyroYawOffset = nextYaw - yaw;
        gyroPitchOffset = nextPitch - pitch;
        gyroCalibrated = true;
      }

      yaw = nextYaw - gyroYawOffset;
      pitch = nextPitch - gyroPitchOffset;
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
      setCanEnableGyro(false);
      setGyroStatus("陀螺仪：已监听");
    };

    const activateGyro = async () => {
      if (!mobile || gyroReady || gyroPermissionPending || typeof window.DeviceOrientationEvent === "undefined") return;

      const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (!window.isSecureContext && !isLocalhost) {
        setCanEnableGyro(true);
        setGyroStatus("陀螺仪：需要 HTTPS 或 localhost");
        return;
      }

      const orientationEvent = DeviceOrientationEvent as DeviceOrientationEventConstructor;
      const motionEvent = (window.DeviceMotionEvent ?? null) as DeviceMotionEventConstructor | null;
      if (!orientationEvent.requestPermission && !motionEvent?.requestPermission) {
        bindGyro();
        return;
      }

      try {
        gyroPermissionPending = true;
        setGyroStatus("陀螺仪：请求权限中");
        const permissions: OrientationPermission[] = [];

        if (orientationEvent.requestPermission) {
          permissions.push(await orientationEvent.requestPermission());
        }
        if (motionEvent?.requestPermission) {
          permissions.push(await motionEvent.requestPermission());
        }

        const granted = permissions.length > 0 && permissions.every((permission) => permission === "granted");
        if (granted) {
          bindGyro();
        } else {
          setCanEnableGyro(true);
          setGyroStatus("陀螺仪：权限被拒绝");
        }
      } catch (error) {
        console.error("陀螺仪权限请求失败：", error);
        setCanEnableGyro(true);
        setGyroStatus("陀螺仪：请求失败，请点按钮重试");
      } finally {
        gyroPermissionPending = false;
      }
    };
    activateGyroRef.current = () => {
      void activateGyro();
    };

    setCanEnableGyro(mobile && typeof window.DeviceOrientationEvent !== "undefined");

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

    updateLoadState("初始化", 0, 0, "创建场景与相机");

    const loader = new GLTFLoader();

    const handleLoadedModel = (gltf: { scene: THREE.Group }) => {
      const model = gltf.scene;
      if (disposed) {
        disposeObject(model);
        return;
      }

      updateLoadState("解析与场景构建", 100, 70, "模型数据已下载，正在解析与构建场景");

      // 按模型配置缩放后再居中，使包围盒计算与相机参数基于缩放后的尺寸。
      model.scale.setScalar(modelConfig.scale);

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
        modelConfig.camera.eyeOffset + modelConfig.camera.minimumEyeClearance,
        size.y * modelConfig.camera.eyeHeightRatio,
      );
      const viewDistance = maxDimension * modelConfig.camera.viewDistanceRatio;
      camera.position.set(
        centeredCenter.x + modelConfig.camera.cameraOffsetX,
        floorMinY + eyeHeight + modelConfig.camera.cameraOffsetY,
        centeredCenter.z + viewDistance + modelConfig.camera.cameraOffsetZ,
      );

      const lookTarget = new THREE.Vector3(
        centeredCenter.x + modelConfig.camera.targetOffsetX,
        floorMinY + size.y * modelConfig.camera.targetHeightRatio,
        centeredCenter.z + modelConfig.camera.targetOffsetZ,
      );
      syncViewAnglesToTarget(lookTarget);
      initialCameraPosition.copy(camera.position);
      initialYaw = yaw;
      initialPitch = pitch;
      scene.add(model);
      model.updateMatrixWorld(true);
      if (VIEWER_CONFIG.collision.enabled) {
        collisionGrid = new CollisionGrid(model, VIEWER_CONFIG.collision.cellSize);
      }

      const parseStartedAt = performance.now();
      const finishSceneBuild = (now: number) => {
        if (disposed) return;

        const elapsed = now - parseStartedAt;
        const progress = Math.min(100, 70 + (elapsed / 900) * 30);
        updateLoadState("解析与场景构建", 100, progress, progress >= 100 ? "场景构建完成，准备渲染" : undefined);

        if (progress < 100) {
          loadProgressFrame = window.requestAnimationFrame(finishSceneBuild);
          return;
        }

        updateLoadState("渲染就绪", 100, 100, "模型已加入场景，进入渲染就绪阶段");
        setModelReady(true);
        setLoadFailed(false);
      };

      loadProgressFrame = window.requestAnimationFrame(finishSceneBuild);
    };

    const handleProgress = (progress: ProgressEvent<EventTarget>) => {
      if (!disposed && progress.total > 0) {
        const percent = (progress.loaded / progress.total) * 100;
        updateLoadState("下载模型", percent, Math.min(35, percent * 0.35), `模型下载 ${percent.toFixed(1)}%`);
      }
    };

    const loadModel = (url: string) => {
      updateLoadState("下载模型", 0, 0, "开始下载模型");
      loader.load(
        url,
        handleLoadedModel,
        handleProgress,
        (error) => {
          if (disposed) return;

          console.error("模型加载失败：", error);
          setLoadFailed(true);
          updateLoadState("加载失败", 0, 0, "模型加载失败，请检查 GLB 文件和服务器路径");
        },
      );
    };

    loadModel(`${MODEL_SOURCE_BASE}${modelConfig.url}`);

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const animate = () => {
      const speedMultiplier = mobile
        ? 1 + joystickStrengthRef.current * (VIEWER_CONFIG.movement.boostMultiplier - 1)
        : keys.shift
          ? VIEWER_CONFIG.movement.boostMultiplier
          : 1;

      const currentMoveSpeed =
        (mobile ? modelConfig.movement.mobileSpeed : modelConfig.movement.desktopSpeed) *
        speedMultiplier;
      const currentVerticalSpeed =
        (mobile
          ? modelConfig.movement.mobileVerticalSpeed
          : modelConfig.movement.verticalSpeed) *
        speedMultiplier;

      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(camera.up, forward).normalize();

      const lateralDelta = new THREE.Vector3();
      if (keys.w) lateralDelta.addScaledVector(forward, currentMoveSpeed);
      if (keys.s) lateralDelta.addScaledVector(forward, -currentMoveSpeed);
      if (keys.a) lateralDelta.addScaledVector(right, currentMoveSpeed);
      if (keys.d) lateralDelta.addScaledVector(right, -currentMoveSpeed);

      if (lateralDelta.lengthSq() > 0) {
        const moved = camera.position.clone().add(lateralDelta);
        const blocked =
          collisionGrid !== null &&
          collisionGrid.isLateralBlocked(moved, VIEWER_CONFIG.collision.radius, VIEWER_CONFIG.collision.wallNormalMax);
        if (!blocked) camera.position.copy(moved);
      }

      const verticalAxis = (risePressedRef.current ? 1 : 0) - (descendPressedRef.current ? 1 : 0);
      if (verticalAxis !== 0) {
        camera.position.y += currentVerticalSpeed * verticalAxis;
      }

      limitCameraHeight();
      if (showCoordsRef.current && coordsHudRef.current) {
        coordsHudRef.current.textContent = `X ${camera.position.x.toFixed(1)}　Y ${camera.position.y.toFixed(1)}　Z ${camera.position.z.toFixed(1)}`;
      }
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(loadProgressFrame);
      resetCameraRef.current = () => undefined;
      activateGyroRef.current = () => undefined;
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
  }, [updateLoadState]);

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

  const setRisePressed = (pressed: boolean) => {
    risePressedRef.current = pressed;
  };

  const setDescendPressed = (pressed: boolean) => {
    descendPressedRef.current = pressed;
  };

  return (
    <section className="viewer-shell" aria-label="修道院三维虚拟漫游">
      <div ref={canvasHostRef} className="viewer-canvas" />

      <button
        className="viewer-control menu-toggle"
        type="button"
        aria-expanded={menuOpen}
        aria-label="更多选项"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="menu-icon" aria-hidden="true" />
      </button>

      {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}

      {menuOpen && (
        <div className="viewer-control menu-panel" role="menu" aria-label="更多选项">
          <button
            className="menu-item"
            type="button"
            role="menuitem"
            disabled={!modelReady}
            onClick={() => {
              resetCameraRef.current();
              setMenuOpen(false);
            }}
          >
            重置
          </button>

          {isMobileDevice && <div className="menu-status">{gyroStatus}</div>}

          {isMobileDevice && canEnableGyro && (
            <button
              className="menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                activateGyroRef.current();
                setMenuOpen(false);
              }}
            >
              启用陀螺仪
            </button>
          )}

          <label className="menu-toggle-row">
            <span>显示坐标</span>
            <input
              type="checkbox"
              checked={showCoords}
              onChange={(event) => {
                const next = event.target.checked;
                setShowCoords(next);
                showCoordsRef.current = next;
              }}
            />
          </label>
        </div>
      )}

      {showCoords && (
        <div className="viewer-control coords-hud" ref={coordsHudRef}>
          X --　Y --　Z --
        </div>
      )}

      {!modelReady && (
        <div className="loading-status" data-error={loadFailed} role={loadFailed ? "alert" : "status"}>
          <div className="loading-kicker">三维模型加载中</div>
          <div className="loading-heading">
            <strong>{loadStage}</strong>
            <span>{loadFailed ? "需要检查" : "请稍候"}</span>
          </div>

          <div className="loading-log" aria-label="模型加载日志">
            {loadLogs.map((log, index) => (
              <div key={`${log}-${index}`}>{log}</div>
            ))}
          </div>

          {!loadFailed && (
            <>
              <div className="loading-progress-row">
                <span>模型下载</span>
                <strong>{downloadProgress.toFixed(1)}%</strong>
              </div>
              <div
                className="loading-progress-track"
                role="progressbar"
                aria-label="模型下载进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={downloadProgress}
              >
                <div className="loading-progress-bar" style={{ width: `${downloadProgress}%` }} />
              </div>

              <div className="loading-progress-row loading-decode-row">
                <span>解析与场景构建</span>
                <strong>{decodeProgress.toFixed(1)}%</strong>
              </div>
              <div className="loading-progress-track loading-decode-track">
                <div className="loading-progress-bar" style={{ width: `${decodeProgress}%` }} />
              </div>

              <div className="loading-overall-row">
                <span>总体进度（估算）</span>
                <strong>{overallProgress.toFixed(0)}%</strong>
              </div>
            </>
          )}
        </div>
      )}

      {isMobileDevice && (
        <div className="mobile-flight-controls">
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

          <div className="flight-buttons" aria-label="飞行升降控制">
            <button
              className="flight-button"
              type="button"
              onPointerDown={() => setRisePressed(true)}
              onPointerUp={() => setRisePressed(false)}
              onPointerCancel={() => setRisePressed(false)}
              onPointerLeave={() => setRisePressed(false)}
            >
              上
            </button>
            <button
              className="flight-button"
              type="button"
              onPointerDown={() => setDescendPressed(true)}
              onPointerUp={() => setDescendPressed(false)}
              onPointerCancel={() => setDescendPressed(false)}
              onPointerLeave={() => setDescendPressed(false)}
            >
              下
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
