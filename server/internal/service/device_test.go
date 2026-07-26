package service

import (
	"testing"
)

func TestDeviceService_Register(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewDeviceService(db, nil)

	// 首次注册
	device, err := svc.Register("dev-001", "Chrome", "Chrome 120", "Windows")
	if err != nil {
		t.Fatalf("注册设备失败: %v", err)
	}
	if device.DeviceID != "dev-001" {
		t.Errorf("DeviceID 不匹配: got %s, want dev-001", device.DeviceID)
	}
	if device.Name != "Chrome" {
		t.Errorf("Name 不匹配: got %s, want Chrome", device.Name)
	}

	// 幂等注册（相同 DeviceID 应更新信息）
	device2, err := svc.Register("dev-001", "Chrome Updated", "Chrome 121", "Windows 11")
	if err != nil {
		t.Fatalf("幂等注册失败: %v", err)
	}
	if device2.Name != "Chrome Updated" {
		t.Errorf("更新后 Name 不匹配: got %s", device2.Name)
	}

	// 验证只有一条记录
	devices, err := svc.List()
	if err != nil {
		t.Fatalf("列出设备失败: %v", err)
	}
	if len(devices) != 1 {
		t.Errorf("设备数量不匹配: got %d, want 1", len(devices))
	}
}

func TestDeviceService_Heartbeat(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewDeviceService(db, nil)

	svc.Register("dev-002", "Firefox", "Firefox", "macOS")

	// 心跳更新
	err := svc.Heartbeat("dev-002")
	if err != nil {
		t.Fatalf("心跳更新失败: %v", err)
	}

	// 验证设备仍存在
	devices, _ := svc.List()
	if len(devices) != 1 {
		t.Error("心跳后设备应该仍然存在")
	}
}

func TestDeviceService_Deregister(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewDeviceService(db, nil)

	svc.Register("dev-003", "Edge", "Edge", "Linux")

	err := svc.Deregister("dev-003")
	if err != nil {
		t.Fatalf("注销设备失败: %v", err)
	}

	devices, _ := svc.List()
	if len(devices) != 0 {
		t.Errorf("注销后设备数量不匹配: got %d, want 0", len(devices))
	}
}

func TestDeviceService_Update(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewDeviceService(db, nil)

	svc.Register("dev-004", "Old Name", "Chrome", "Windows")

	device, err := svc.Update("dev-004", "New Name")
	if err != nil {
		t.Fatalf("更新设备失败: %v", err)
	}
	if device.Name != "New Name" {
		t.Errorf("更新后名称不匹配: got %s, want New Name", device.Name)
	}

	// 更新不存在的设备
	_, err = svc.Update("dev-nonexist", "Test")
	if err == nil {
		t.Error("更新不存在的设备应该返回错误")
	}
}
