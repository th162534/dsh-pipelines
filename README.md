# dsh-pipelines

DSH 本地脚本流水线插件。把确定性工作（下载、转写、抽帧、OCR、格式转换）交给独立进程执行，只把「状态 + 产物路径」交回对话模型。

## 工具

- `capabilities`：一次看全本机能力（流水线 + 专家索引）。
- `pipeline_list`：列出可用流水线（id、标题、触发关键词、预计耗时、输入项）。
- `pipeline_run`：执行一条流水线，返回 `runId`、每步状态、产物路径。不返回产物全文。

## 内置流水线

| id | 用途 |
|---|---|
| `echo` | 自测：写一个文件，验证插件与执行器 |
| `bili-evidence` | B 站视频证据整理：转写 + 抽帧 + OCR，产出 `transcript.md` |

## 目录

```
pipelines/<id>/pipeline.json   声明式定义
pipelines/<id>/steps/*.mjs     步骤脚本（可选）
lib/registry.mjs               扫描与校验
lib/runner.mjs                 逐步执行、超时、run.json
scripts/selftest.mjs           自测
```

## pipeline.json 字段

| 字段 | 说明 |
|---|---|
| `id` | 必须与目录名一致 |
| `title` | 展示名 |
| `when.keywords` | 触发关键词（给路由用） |
| `requires.bin` | 需要的可执行文件 |
| `inputs` | 输入声明，`{type, default, required}` |
| `steps[]` | `{id, run, args, timeout, out, cache}` |
| `verify.file` | 完成后应存在的产物 |

## 运行状态

每次执行写入 `runs/<runId>/run.json`，产物在 `runs/<runId>/artifacts/`。
步骤失败即停，保留已完成产物，`status` 为 `failed`，并标明失败步。

## 安装

本包自带 `cordis.patch.yml`，装进 profile 后声明行自动合并，不需要在 profile 里手写：

```bash
dsh plugin --profile desktop add link:D:/dsh-plugins/dsh-pipelines
```

自带的声明行只有三行，`config` 留空、不写盘符：

```yaml
- insert:
    - id: dsh-pipelines
      name: 'dsh-pipelines'
      inject: [tools]
```

### 配置优先级

`~/.dsh/pipelines.config.json` → 声明行 `config` → 内置默认值。机器路径只写前者：

```json
{ "root": "D:/dsh-plugins/dsh-pipelines/pipelines", "runs": "C:/Users/ASUS/.dsh/runs" }
```

- `root`：流水线目录（默认 `~/.dsh/pipelines`）
- `runs`：运行记录目录（默认 `~/.dsh/runs`）
- `maxSteps`：单次运行最多步数（默认 20）

改完重启应用生效；加载与注册过程写 `~/.dsh/pipelines-load.log`。

### 已知限制

`dsh-tools` 只接受 JSON Schema 子集：`type` 必须是**单个字符串**（写成数组会让整条工具注册失败），且不支持 `type` 与 `oneOf` 并存。写工具输出 schema 时按此收敛。

## 文档

- [使用说明](docs/usage.md)
- [设计说明](docs/design.md)

## 自测

```bash
node scripts/selftest.mjs
```
