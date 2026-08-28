package service

import (
	"errors"
	"testing"

	"github.com/spidermemos/tab-sync/server/internal/model"
)

// createWS 创建一个工作组并返回其 id
func createWS(t *testing.T, svc *WorkspaceService, name, parentID string) string {
	t.Helper()
	res, err := svc.Create(CreateWorkspacePayload{Name: name, ParentID: parentID})
	if err != nil {
		t.Fatalf("创建工作组 %s 失败: %v", name, err)
	}
	return res.Workspace.ID
}

// orderOf 返回指定父级下子级的当前顺序（按 sort_order 升序）
func orderOf(t *testing.T, svc *WorkspaceService, parentID string) []string {
	t.Helper()
	all, err := svc.List(true, false)
	if err != nil {
		t.Fatalf("列出工作组失败: %v", err)
	}
	var out []string
	for _, w := range all {
		if w.ParentID == parentID {
			out = append(out, w.ID)
		}
	}
	return out
}

func TestWorkspaceService_Move_SameLevel(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	a := createWS(t, svc, "A", "")
	b := createWS(t, svc, "B", "")
	c := createWS(t, svc, "C", "")

	// 把 C 移到 A 后面：A C B
	if err := svc.MoveWorkspace(c, MoveWorkspacePayload{TargetID: a, Position: MoveAfter}); err != nil {
		t.Fatalf("移动失败: %v", err)
	}
	got := orderOf(t, svc, "")
	want := []string{a, c, b}
	if !equalStrings(got, want) {
		t.Errorf("同级重排结果不符: got %v, want %v", got, want)
	}
}

func TestWorkspaceService_Move_ToAnotherParent(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	a := createWS(t, svc, "A", "")
	a1 := createWS(t, svc, "A1", a)
	b := createWS(t, svc, "B", "")
	b1 := createWS(t, svc, "B1", b)

	// 把 B 拖入 A 内部：A 的子级追加为 [A1, B]，根级只剩 A
	if err := svc.MoveWorkspace(b, MoveWorkspacePayload{TargetID: a, Position: MoveInner}); err != nil {
		t.Fatalf("移动失败: %v", err)
	}
	if got, want := orderOf(t, svc, a), []string{a1, b}; !equalStrings(got, want) {
		t.Errorf("新父级子级顺序不符: got %v, want %v", got, want)
	}
	if got, want := orderOf(t, svc, ""), []string{a}; !equalStrings(got, want) {
		t.Errorf("原父级剩余顺序不符: got %v, want %v", got, want)
	}
	// 整棵子树跟着搬走，B1 仍在 B 之下
	if got, want := orderOf(t, svc, b), []string{b1}; !equalStrings(got, want) {
		t.Errorf("被移动子树结构被破坏: got %v, want %v", got, want)
	}
}

func TestWorkspaceService_Move_RejectCycle(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	a := createWS(t, svc, "A", "")
	a1 := createWS(t, svc, "A1", a)
	a11 := createWS(t, svc, "A11", a1)

	// 拖入自己的子级、以及放到孙级的前后，都会让新父级落在自身子树内
	cases := []struct {
		name     string
		targetID string
		position string
	}{
		{"拖入直接子级", a1, MoveInner},
		{"拖入孙级", a11, MoveInner},
		{"排到孙级之后", a11, MoveAfter},
		{"排到直接子级之前", a1, MoveBefore},
	}
	for _, c := range cases {
		err := svc.MoveWorkspace(a, MoveWorkspacePayload{TargetID: c.targetID, Position: c.position})
		if !errors.Is(err, ErrWorkspaceMoveCycle) {
			t.Errorf("%s: 期望成环错误, got %v", c.name, err)
		}
	}
	if err := svc.MoveWorkspace(a, MoveWorkspacePayload{TargetID: a, Position: MoveInner}); !errors.Is(err, ErrWorkspaceMoveCycle) {
		t.Errorf("拖到自身: 期望成环错误, got %v", err)
	}
}

func TestWorkspaceService_Move_RejectSystemWorkspace(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	ungrouped, err := svc.GetOrCreateUngroupedWorkspace()
	if err != nil {
		t.Fatalf("创建未分组失败: %v", err)
	}
	target := createWS(t, svc, "A", "")

	if err := svc.MoveWorkspace(ungrouped.WorkspaceID, MoveWorkspacePayload{TargetID: target, Position: MoveAfter}); err == nil {
		t.Error("系统工作组应不可移动")
	}
}

func TestWorkspaceService_Move_MissingTarget(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	a := createWS(t, svc, "A", "")

	err := svc.MoveWorkspace(a, MoveWorkspacePayload{TargetID: "not-exist", Position: MoveAfter})
	if !errors.Is(err, ErrWorkspaceMoveTarget) {
		t.Errorf("参照节点不存在时应返回 ErrWorkspaceMoveTarget, got %v", err)
	}
	if err := svc.MoveWorkspace(a, MoveWorkspacePayload{TargetID: createWS(t, svc, "B", ""), Position: "sideways"}); !errors.Is(err, ErrWorkspaceMoveInvalid) {
		t.Errorf("落点位置非法时应返回 ErrWorkspaceMoveInvalid, got %v", err)
	}
}

// TestWorkspaceService_CreateAppendsToEnd 新工作组应追加到同级末尾，而不是插到队首
func TestWorkspaceService_CreateAppendsToEnd(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	a := createWS(t, svc, "A", "")
	b := createWS(t, svc, "B", "")
	// 手动把 B 排到 A 前面，制造非创建顺序的排列
	if err := svc.MoveWorkspace(b, MoveWorkspacePayload{TargetID: a, Position: MoveBefore}); err != nil {
		t.Fatalf("移动失败: %v", err)
	}
	c := createWS(t, svc, "C", "")
	if got, want := orderOf(t, svc, ""), []string{b, a, c}; !equalStrings(got, want) {
		t.Errorf("新建工作组应追加到末尾: got %v, want %v", got, want)
	}

	var ws model.Workspace
	if err := db.Where("workspace_id = ?", c).First(&ws).Error; err != nil {
		t.Fatalf("读取工作组失败: %v", err)
	}
	if ws.SortOrder != 2 {
		t.Errorf("新建工作组 sort_order 应为 2, got %d", ws.SortOrder)
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
