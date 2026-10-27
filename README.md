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

在 profile 的 `cordis.patch.yml` 加一行（`name` 指向本包，路径按实际放置）:

```yaml
- id: dsh-pipelines
  name: 'dsh-pipelines'
  inject: [tools]
  config:
    root: ''      # 留空 = ~/.dsh/pipelines
    runs: ''      # 留空 = ~/.dsh/runs
```

流水线也可以直接放在本仓库的 `pipelines/` 下，用 `root` 指过去：

```yaml
config:
  root: D:/dsh-plugins/dsh-pipelines/pipelines
```

## 文档

- [使用说明](docs/usage.md)
- [设计说明](docs/design.md)

## 自测

```bash
node scripts/selftest.mjs
```
