# MusicCue 🎧

**MusicCue** 是一款基于**用户历史听歌画像**与**大语言模型**的 Apple Music 智能场景推荐与一键插播引擎。

项目采用现代 **瑞士极简亮色版式（Swiss Minimalist Light Theme）** 设计，将复杂的音乐分析和推送模块整合在统一的单屏仪表盘（Single-Viewport Dashboard）中，支持独立面板内部滚动，所见即所得。

---

## ✨ 核心特性

1. **📊 智能听歌画像分析**
   - **大文件本地解析**：支持直接拖拽上传 macOS 音乐 App 导出的 `Library.xml` 或 Apple 个人数据中导出的 `Play Activity.csv`。
   - **画像生成**：解析并自动统计出您历史听过的歌手数、去重单曲量、总播放次数，并为您实时生成最爱歌手与常用流派的标签云。
   - **极简切换**：画像生成后自动收起上传区域，腾出屏幕空间，并支持随时一键清除并重置画像。

2. **🧪 场景化推荐工坊**
   - **自然语言输入**：自由输入当前的听歌场景或心情（例如：“深夜静心敲代码，需要专注，推荐好听但不过于吵闹的日系 City Pop”）。
   - **场景快速模板**：内置“深夜敲代码”、“雨天咖啡馆”、“运动健身”等多种精心调校的场景模板，一键套用。
   - **参数微调**：可展开高级配置，手动调整曲库地区（美国、中国大陆、台湾、香港、日本、英国）、推荐歌曲数量（5~30 首），以及 AI 探索度（Temperature 0.2~1.0）。

3. **🎵 全局悬浮试听控制台**
   - 接入 iTunes Store 音频流，在生成推荐列表后，无需跳转即可在网页底部悬浮窗中直接试听 30 秒无损预览，支持 timeline 进度条拖动与音量调节。

4. **⚡ macOS 快捷指令静默同步**
   - **零成本方案**：无需购买付费的 Apple 开发者账号或配置繁琐的 Web API。
   - **快捷调用**：网页通过后台 API 动态检测您 Mac 上的快捷指令列表，如有同名指令则变为绿色 `● 快捷指令已就绪` 状态。点击“同步”即可一键无感插播至您本地 macOS 音乐 App 的**“接着播放 (Playing Next)”**队列中。

---

## 🛠️ 技术架构

- **后端**：基于 **FastAPI (Python 3.9+)**，集成 **google-genai SDK**（支持 direct HTTP API 自动平滑降级）访问 Gemini 2.5 Flash 生成定制推荐。
- **前端**：采用原生的 **HTML5、Vanilla CSS (现代 CSS 变量)、JavaScript (ES6+)** 以及 **Lucide 图标库**，完全摒弃第三方 CSS 框架以保障加载速度与极致的 Swiss Minimalism 视觉品味。
- **本地存储**：API Key 与设置项安全保存在浏览器本地（`LocalStorage`），不经过任何第三方服务器中转。

---

## 🚀 快速开始

### 1. 准备工作
克隆本项目至本地，并在项目根目录下安装 Python 依赖：

```bash
# 创建并激活虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 安装项目依赖
pip install -r requirements.txt
```

### 2. 运行本地服务
启动 Uvicorn 开发服务器：

```bash
python3 -m uvicorn app:app --port 8000 --reload
```

在浏览器中打开 **[http://localhost:8000](http://localhost:8000)**。

### 3. 配置 Gemini API Key
点击右上角的 **“服务配置”**，粘贴您的 Gemini API Key（可在 [Google AI Studio](https://aistudio.google.com/) 免费获取），默认快捷指令名称保持为 `MusicCue`。

## 🔗 配置 Mac 一键同步快捷指令 (Shortcuts)

为了您的方便，我们已经将预先配置好的快捷指令文件直接打包在项目仓库中：

1. 双击项目根目录下的 **[shortcuts/MusicCue.shortcut](shortcuts/MusicCue.shortcut)** 文件，即可直接在您的 Mac 上安装此快捷指令。
2. 导入时如果提示设置名称，请确保指令名称为 **`MusicCue`**。

如果您想手动创建或者需要了解该快捷指令的工作流动作，可在 Mac 上的 **“快捷指令 (Shortcuts)”** App 中新建名为 **`MusicCue`** 的指令，并按顺序添加以下 4 个节点动作：

1. ➕ **拆分文本 (Split Text)**：将 **“快捷指令输入”** 按照 **“换行符”** 拆分。
2. ➕ **重复运行每个项目 (Repeat with Each)**：循环遍历拆分出的每一行文本。
3. ➕ **在 iTunes Store 中搜索 (Search iTunes Store)**（放置于循环体内部）：
   - 将搜索词设为 **“重复项目”**。
   - 类别选择 **“歌曲”**。
   - 结果限制改为 **`1`**。
   - 地区选择 **“美国”** (或者您首选的曲库地区)。
4. ➕ **添加至“接着播放” (Add to Playing Next)**（放置于循环体内部）：
   - 将 **“iTunes 产品”** 添加到“接着播放”的 **“稍后” (Later)**。

安装或配置完毕后，关闭快捷指令 App。网页右上角检测到 `● 快捷指令已就绪` 后，即可一键享受无感同步插播体验！
