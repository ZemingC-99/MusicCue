# MusicCue

基于听歌历史与大语言模型的 Apple Music 场景化智能推荐与同步工具。

已编译为 macOS 原生桌面应用程序，开箱即用，支持配置与听歌画像的本地持久化存储。

---

## 快速开始（推荐：下载桌面客户端）

最简单的方式是直接下载打包好的 `.dmg` 安装包，无需安装任何 Python 依赖。

### 1. 下载安装包

前往 GitHub [Releases 页面](https://github.com/ZemingC-99/MusicCue/releases/tag/v1.0.0) 下载最新版本的 `MusicCue.dmg`。

### 2. 安装

- 双击打开 `MusicCue.dmg`。
- 将 **MusicCue** 图标拖拽到 **Applications**（应用程序）文件夹中完成安装。

### 3. 导入快捷指令（Mac 专属同步功能）

- 启动 MusicCue，点击右上角 **「服务配置」** 按钮。
- 点击卡片最下方的 **【一键导入】** 按钮，系统将自动拉起弹窗并导入内置的 `MusicCue` 快捷指令。（也可以在 DMG 挂载磁盘窗口中直接双击 `MusicCue.shortcut` 导入。）
- 当界面右上角标变为绿色 **`● 快捷指令已就绪`** 时，点击"同步"即可将推荐歌曲插播到系统 Music 的待播清单中。

---

## 功能说明

1. **听歌画像分析**
   - 支持拖拽上传 macOS 音乐 App 导出的 `Library.xml` 或 Apple 个人数据中的 `Play Activity.csv`。
   - 文件在本地解析，不会上传至任何外部服务器。
   - 解析完成后自动提炼常听歌手、流派比例与播放统计，生成个性化画像标签。

2. **场景化推荐**
   - 描述当前心情或场景，或使用内置模版（深夜敲代码、雨天咖啡馆、自驾兜风等）。
   - 可调整曲库过滤地区（中国大陆、台湾、香港、美国、日本、英国）、生成数量（5 ~ 50 首）与 AI 温度参数。
   - 自动记录最近 50 首推荐歌曲，再次生成时自动去重。

3. **多 AI 模型支持**
   - 支持 **Google Gemini**（`gemini-2.5-flash`）、**OpenAI**（`gpt-4o-mini`）与 **DeepSeek**（`deepseek-chat`）。
   - 在「服务配置」中填入对应的 API Key 即可切换使用。

4. **本地持久化**
   - API 密钥、偏好设置与听歌画像均存储在 `~/Library/Application Support/MusicCue/` 目录下，下次启动自动加载，无需重新配置。

---

## 开发者模式（本地源码运行）

### 1. 克隆仓库与安装依赖

```bash
git clone https://github.com/ZemingC-99/MusicCue.git
cd MusicCue

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. 启动开发服务器

```bash
python3 -m uvicorn app:app --port 8000 --reload
```

在浏览器打开 [http://localhost:8000](http://localhost:8000) 即可进行开发。

### 3. 重新打包（macOS）

修改代码后，可在激活的虚拟环境中运行：

```bash
python build_mac.py
```

约 30 秒后在 `dist/` 目录下生成新的 `MusicCue.dmg`。

---

## 手动配置快捷指令（备选）

如果一键导入无法正常工作，可在 Mac 的「快捷指令」App 中手动创建名为 `MusicCue` 的指令，依次添加以下 4 个动作：

1. **拆分文本**：将"快捷指令输入"以"换行符"拆分。
2. **重复运行每个项目**：遍历拆分后的每行文本。
3. **在 iTunes Store 中搜索**（位于循环体内）：搜索项设为"重复项目"，类别设为"歌曲"，结果限制 `1`，地区选择对应曲库。
4. **添加至"接着播放"**（位于循环体内）：将"iTunes 产品"添加到"稍后"。

---

## 开源协议

本项目基于 [MIT License](LICENSE) 协议开源。
