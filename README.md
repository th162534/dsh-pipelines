# dsh-pipelines

DSH 本地脚本流水线插件。把确定性工作（下载、转写、抽帧、OCR、格式转换）交给独立进程执行，只把「状态 + 产物路径」交回对话模型。

## 工具

- `pipeline_list`：列出可用流水线（id、标题、触发关键词、预计耗时）。
- `pipeline_run`：执行一条流水线，返回 `runId`、每步状态、产物路径。不返回产物全文。

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

## 自测

```bash
node scripts/selftest.mjs
```
