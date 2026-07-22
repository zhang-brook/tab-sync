# 提交约定 (Commit Convention)

## 格式

```
<type>(<scope>): <subject>

[body]

Co-authored-by: CodeBuddy <codebuddy@tencent.com>
```

## 类型 (type)

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 代码重构（不改变功能） |
| `docs` | 文档更新 |
| `test` | 添加/修改测试 |
| `chore` | 构建、依赖、杂项 |

## 范围 (scope)

使用受影响的模块名，如 `config`、`model`、`auth`、`setup`、`logger`、`server` 等。

## 规则

1. **英语提交信息**：subject 和 body 均使用英语
2. **原子提交**：每个 commit 必须是可编译、可运行的独立变更
3. **仅提交自己的改动**：不提交无关的本地文件修改
4. **AI 协助标记**：AI 协助的提交必须在 message 末尾添加 `Co-authored-by: CodeBuddy <codebuddy@tencent.com>`

## 示例

```
feat(config): add log configuration and random secret generator

- Add LogLevel and LogOutput fields with environment variable support
- Add generateRandomSecret() for default JWT secret fallback

Co-authored-by: CodeBuddy <codebuddy@tencent.com>
```
