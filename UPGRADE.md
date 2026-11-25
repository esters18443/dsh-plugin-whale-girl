# 升级说明 · Upgrade notes

## 首次安装

没有安装过鲸鱼插件、也没有旧条目覆盖配置时，无需执行任何迁移。使用 README 给出的固定版本标识，在 DSH 插件管理器中安装并按需启用。

## 从 0.1.x 或公开版 0.2.x 升级（包已改名）

0.2.0 起插件包名与条目 ID 都改为鲸鱼娘品牌：

| 时期 | 条目 ID | 模块名（npm 包名） |
|---|---|---|
| 公开 0.2.6 及更早 | `dsh-plugin-whale-pet` | `dsh-plugin-whale-pet` |
| 公开 0.2.7–0.2.9、本线 0.1.x | `whale-pet` | `dsh-plugin-whale-pet` |
| **本线 0.2.0 起** | `whale-girl` | `dsh-plugin-whale-girl` |

新旧包是两个不同的 npm 包：直接覆盖安装不会生效，且新旧并存时会同时出现两只鲸鱼。按以下顺序操作：

1. 等正在运行的任务结束，记录原插件启停状态，并备份相关配置。
2. 安装新包 `dsh-plugin-whale-girl@<版本>`（此时旧鲸鱼还在，会出现两只）。
3. 在插件管理器中**移除旧包** `dsh-plugin-whale-pet`。
4. 把配置层中属于本插件的 ID 定向覆盖项迁移到 `whale-girl`：`whale-pet` 和 `dsh-plugin-whale-pet` 都是历史 ID。工具 `tools/entry-id-migration.mjs` 可离线规划迁移，不代替人工检查。
5. 注意：偏好存储键已随包名更新（`dsh-plugin-whale-girl:v1`），位置、大小、会话列表宽度等偏好会重置一次。
6. 完整退出并重开 DSH。确认只有一条 `whale-girl` 记录、加载模块正确、启停状态与迁移前一致，并检查启动日志中是否仍有旧 ID 找不到的提示。

仅用于说明的片段，**不要拿它覆盖完整配置文件**：

```yaml
# 迁移前（这些历史 ID 都可能出现）
- id: whale-pet          # 或 dsh-plugin-whale-pet
  disabled: true

# 迁移后：保留禁用状态
- id: whale-girl
  disabled: true
```

## 回退

回退涉及 ID 与包名变更的版本时，包和覆盖配置必须对应：旧包使用旧 ID，新包使用新 ID。只恢复安装包不一定恢复原启停设置。请使用升级前备份，不在任务运行期间回退。回退到 0.1.x 后偏好再次从旧存储键读取。

---

**English summary:** from 0.2.0 the package is `dsh-plugin-whale-girl` and the entry ID is `whale-girl`; earlier releases used `whale-pet` (since public 0.2.7) or `dsh-plugin-whale-pet` (public 0.2.6 and earlier). Install the new package, remove the old bundle, migrate ID-targeted overrides with the committed planning tool, and expect a one-time preference reset (the storage key moved with the rename). No automatic profile migration runs on install. Complete package/configuration changes while DSH is stopped, and verify the resulting entry and state before resuming work.
