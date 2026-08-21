// 模型资源基地址：开发环境走本地 public，生产环境走 GitHub raw。
// Next 在编译时把 process.env.NODE_ENV 静态内联（next dev -> development，其余 -> production），
// 因此该值在 next build 打包那一刻被固定，next start 不会重新计算。
// 如需切换分支/CDN，只需修改下面的 remote 基地址。
export const MODEL_SOURCE_BASE =
  process.env.NODE_ENV === "development"
    ? ""
    : "https://github.com/mejiro-rin/zxy-model/raw/refs/heads/main/public";
