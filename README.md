# MusicCue 🎧

基于听歌历史与大语言模型的 Apple Music 场景推荐工具，生成推荐后可通过 macOS 快捷指令直接插播到音乐 App。

界面为亮色单屏布局，三列并排，各面板独立滚动。

---

## 功能

1. **听歌画像分析**
   - 支持拖拽上传 macOS 音乐 App 导出的 `Library.xml` 或 Apple 个人数据中的 `Play Activity.csv`，文件在本地解析，不上传。
   - 统计歌手数、去重单曲量、总播放次数，生成常听歌手和流派标签。
   - 分析完成后上传区收起，可随时重置。

2. **场景推荐**
   - 自由描述当前想听的风格或心情，或从内置模板（深夜敲代码、雨天咖啡馆、运动健身等）选一个。
   - 可调整曲库地区（美国/中国大陆/台湾/香港/日本/英国）、数量（5~50 首）和 Temperature。
   - 自动记录最近 50 首推荐结果，下次生成时自动排除，避免重复。重置画像时同步清空。

3. **多 AI 服务商**
   - 右上角"服务配置"面板可切换：
     - **Gemini**：`gemini-2.5-flash`，[Google AI Studio](https://aistudio.google.com/) 可免费申请。
     - **OpenAI**：`gpt-4o-mini`，[OpenAI Platform](https://platform.openai.com/)。
     - **DeepSeek**：`deepseek-chat`，[DeepSeek Platform](https://platform.deepseek.com/)。
   - 各服务商的 Key 独立保存在浏览器 `localStorage`，切换即生效。

5. **macOS 快捷指令同步**
   - 无需 Apple 开发者账号，通过系统快捷指令调用音乐 App。
   - 网页检测到同名快捷指令后变为绿色"快捷指令已就绪"，点击同步即可加入"接着播放"队列。

---

## 技术栈

- **后端**：FastAPI (Python 3.9+)，调用 Gemini 使用 google-genai SDK（带 HTTP 降级），调用 OpenAI / DeepSeek 走标准 OpenAI 兼容接口。
- **前端**：HTML + Vanilla CSS + JavaScript，Lucide 图标。
- **存储**：所有 Key 和配置存在浏览器本地，不经过服务器。

---

## 快速开始

### 1. 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python3 -m uvicorn app:app --port 8000 --reload
```

打开 [http://localhost:8000](http://localhost:8000)。

### 3. 配置 API Key

点击右上角"服务配置"，选择服务商，粘贴 Key 后回车保存。状态变为"Key 已配置"即可。

---

## 配置 Mac 快捷指令

仓库里已打包好快捷指令文件，直接双击安装：

**[shortcuts/MusicCue.shortcut](shortcuts/MusicCue.shortcut)**

导入时确认名称为 `MusicCue`。

如需手动创建，在 Mac"快捷指令"App 新建名为 `MusicCue` 的指令，依次添加：

1. **拆分文本**：将"快捷指令输入"按换行符拆分。
2. **重复运行每个项目**：遍历每行文本。
3. **在 iTunes Store 中搜索**（循环内）：搜索词为"重复项目"，类别"歌曲"，结果限制 `1`，地区选美国或其他。
4. **添加至"接着播放"**（循环内）：将 iTunes 产品加到"稍后 (Later)"。

配置完毕后右上角变为绿色"快捷指令已就绪"，即可使用。
