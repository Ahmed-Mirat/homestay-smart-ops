# 分支与提交规范

## 分支策略

```
master  ← 只合入，不直接提交。永远可部署。
  ↑ PR + 审批
feat_<项目>_<日期>  每个模块独立分支，互不交叉
```

| 规则 | 说明 |
|------|------|
| **master 禁止直接 push** | 所有变更必须走 PR，至少 1 人审批 |
| **feat 分支独立** | 每个模块一个分支，不互相 merge |
| **feat 分支命名** | `feat_<模块名>_<MMDD>`，如 `feat_zhuyue_0612` |
| **不交叉合并** | feat_apt 的代码不进 feat_zhuyue，反之亦然 |
| **不 rebase master** | feat 分支不 rebase 到 master，避免提交历史污染 |

## 日常操作

### 在 feat 分支上开发

```bash
git checkout feat_<模块>_<日期>
# 写代码...
git add .
git commit -m "feat(scope): 描述"
git push origin feat_<模块>_<日期>
```

### 需要 master 的最新变更时

```bash
git checkout feat_<模块>_<日期>
git merge origin/master --no-ff     # 用 merge，不用 rebase
```

### 合入 master

```bash
# 在 GitHub 上发 PR: feat_xxx → master
# 审批通过后，通过 GitHub UI 合并
# 合完后删除远程 feat 分支（本地保留）
```

## 提交格式

```
<type>(<scope>): <subject>

type:
  feat     = 新功能
  fix      = 修 bug
  docs     = 文档/注释
  chore    = 工程化（依赖/配置/样本数据）
  refactor = 重构（不改功能）
  test     = 测试

scope:  模块名，如 huaye-walker, cron-scheduler, apt, zhuyueyunlu, yueshe-business
```

### 示例

```
feat(huaye-walker): 房租催缴三档话术 + AI个性化生成
feat(apt): apartment-service 增值服务推送模块
fix: 竞品价格采集携程页面解析失败
docs: 更新各模块安装说明
chore: 添加 inventory 样本数据
refactor(cron-scheduler): 提取调度器为共享模块
```

### 严禁

- ❌ `fix bug` — 没有 scope 和具体描述
- ❌ `WIP` / `tmp` / `save`
- ❌ 一次提交塞多个不相关的改动
- ❌ `git push --force` 到任何远程分支

## 提交模板

```bash
git config commit.template .gitmessage
```

设置后在 `git commit` 时会自动弹出模板。
