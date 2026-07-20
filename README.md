# JSON Lens

一个零依赖、完全在浏览器本地运行的 JSON 格式化与可视化工具。

## 本地预览

直接打开 `index.html`，或在此目录运行：

```bash
python3 -m http.server 8080
```

然后访问 <http://localhost:8080>。

报文规则工具地址：<http://localhost:8080/rule-lab.html>

## 在线地址

部署完成后访问：<https://maojunhao.github.io/json-lens/>

## 部署到 GitHub Pages

项目已包含 GitHub Actions 工作流。推送到 `main` 分支后，在仓库的
**Settings → Pages → Build and deployment** 中将 Source 设为 **GitHub Actions**，
之后每次提交都会自动更新网站。

## 功能

- JSON 格式化与压缩
- 可折叠树形结构与代码视图
- 键和值搜索高亮
- 文件上传与拖放读取
- 复制与下载结果
- 错误位置提示
- 深色模式与响应式布局
- 数据全程在本地处理
- 从 JSON、CSV、XML、TXT 样例自动推断字段校验规则
- 规则列表本地留存、重新编辑与异常报文标红
