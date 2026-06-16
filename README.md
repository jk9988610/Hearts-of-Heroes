# Hearts-of-Heroes（三国雄心）

## 在线试玩

推送 `main` 后自动部署：

**https://jk9988610.github.io/Hearts-of-Heroes/**

> 仓库 Settings → Pages → Source 需选 **GitHub Actions**（非 Jekyll）。

## 本地运行

```bash
npm install
npm run dev
```

## v0.4 新功能

- **开局选势力**：魏 / 蜀 / 吴（点「新游戏」生效）
- **地图拖拽**：在地图上按住拖动可平移（窄屏可滚动查看）
- **顶部提示条**：粮荒、战斗结果等，无需只看日志
- 国策、胜负、驻军箭头、版本检查（见 v0.3）

## 调试

- **检查版本**：对比本地与 Pages 上的 `version.json`
- **复制日志** / **打印详情**（含军队一览）

## 构建

```bash
npm run build
npm run preview
```
