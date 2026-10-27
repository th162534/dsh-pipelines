# 使用说明

## 为什么用流水线

对话模型每多一个工具，系统提示词就多一份定义；每多一轮对话，就多一次上下文传输。
把「下载、转写、抽帧、OCR、格式转换」这类**结果确定、步骤固定**的工作交给独立进程，只把「路径 + 摘要」交回模型，能同时省 token、省时间、减少出错。

代价：脚本本身要维护，且**不适合需要判断的工作**。判断（取舍、评价、写结论）仍交给专家。

## 三个工具

| 工具 | 用途 | 返回 |
|---|---|---|
| `capabilities` | 一次看全「本机能做什么」 | 流水线 + 专家清单（短文本） |
| `pipeline_list` | 列流水线与输入项 | 结构化列表 |
| `pipeline_run` | 执行一条流水线 | runId、每步状态、产物路径 |

`pipeline_run` 只回路径不回收内容，大产物不会撑爆上下文。

## 调用示例

```json
{ "id": "bili-evidence", "inputs": { "url": "https://www.bilibili.com/video/BVxxxx", "start": 0, "end": 120 } }
```

先小范围跑（`start`/`end` 各 60–120 秒）确认可用，再跑全片。

## 加一条流水线

1. 建目录 `pipelines/<id>/`，写 `pipeline.json`。
2. 需要脚本时放 `pipelines/<id>/steps/*.mjs`，从环境变量取参数：
   - `PIPELINE_INPUTS`：JSON 字符串，合并了默认值
   - `PIPELINE_RUN_DIR`、`PIPELINE_ARTIFACTS`：本次运行目录
3. 步骤声明 `out` 时必须真生成该文件，否则运行判失败。
4. `verify.file` 做最后验收。

## 配置优先级

插件启动时按这个顺序取配置，后者覆盖前者：

1. `~/.dsh/pipelines.config.json`（机器级，改完重启生效）
2. 声明行里的 `config`
3. 代码内置默认值

```json
{ "root": "D:/dsh-plugins/dsh-pipelines/pipelines", "runs": "C:/Users/ASUS/.dsh/runs", "maxSteps": 20 }
```

`root` 指流水线目录，`runs` 指运行记录目录。加载、注册与异常都写 `~/.dsh/pipelines-load.log`：出现 `module imported` 说明模块被加载，出现 `register: xxx` 说明工具注册成功，`ERROR` 行带堆栈。

## 本机路径怎么配

公开仓不写死盘符。把本机相关配置放进 `pipelines/<id>/pipeline.local.json`（已在 `.gitignore`）：

```json
{
  "inputs": {
    "python": "C:/Users/ASUS/.dsh/bili-vision-venv/Scripts/python.exe",
    "bvScript": "D:/dsh-plugins/bili-vision/bv.py",
    "cacheDir": "D:/dsh-cache/bili-vision"
  }
}
```

`pipeline.local.json` 的 `inputs` 会与 `pipeline.json` 的 `inputs` 合并，覆盖同名项。

## 运行记录

```
~/.dsh/runs/<runId>/
  run.json          输入、每步状态、耗时、错误、产物清单
  artifacts/        产物
```

失败时 `run.json` 保留已完成步骤与最后 2KB stderr，便于定位。

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `spawn EPERM` | 在受限沙箱里跑子进程 | 由 DSH 应用进程执行，或用完整权限运行 |
| `缺少 python 路径` | 没配 `pipeline.local.json` | 见上一节 |
| `bv.py inspect 失败` | 视频需要登录 / 网络 / 依赖缺失 | 先单独跑 `bv.py` 看 stderr |
| 产物越界 | `out` 写了 `../` | 只允许相对运行目录的路径 |
| 步骤超时 | 视频太长 | 用 `start`/`end` 分段，或调大 `timeout` |
