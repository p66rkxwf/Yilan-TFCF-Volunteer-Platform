# 快速參考指南 - 版面設計系統

## 文字大小和排版

### 標題
```typescript
<h1>超大標題</h1>           // 3rem, 分層響應式
<h2>大標題</h2>           // 2.25rem, 分層響應式
<h3>常規標題</h3>         // 1.875rem, 分層響應式
<h4>小標題</h4>           // 1.5rem
<h5>卡片標題</h5>         // 1.25rem
<h6>輔助標題</h6>         // 1.125rem
```

### 段落和文本
```typescript
<p>正常段落文本</p>           // 1rem (16px)
<small>較小的文本</small>      // 0.875rem (14px)
<p className="text-xs">最小文本</p>  // 0.75rem (12px)
<p className="text-muted">靜音文本</p>  // 灰色文本
<p className="text-subtle">細微文本</p> // 非常淺灰色
```

---

## 常見間距組合

### 區塊間距（Section）
```typescript
// 通常頁面區塊
<section className="section-padding">...</section>
// 對應: py-12 sm:py-16 md:py-20 lg:py-24

// 側邊欄或較小區塊
<section className="section-padding-sm">...</section>
// 對應: py-8 sm:py-10 md:py-12 lg:py-14

// Hero 和 CTA 區塊
<section className="section-padding-lg">...</section>
// 對應: py-16 sm:py-20 md:py-28 lg:py-32
```

### 卡片間距
```typescript
// 卡片內容區域
<div className="card-padding">...</div>
// 對應: p-4 sm:p-6 md:p-8

// 緊湊卡片
<div className="card-padding-sm">...</div>
// 對應: p-3 sm:p-4 md:p-6

// 寬敞卡片
<div className="card-padding-lg">...</div>
// 對應: p-6 sm:p-8 md:p-10
```

### 內容間距
```typescript
// 項目之間的標準間距
<div className="content-spacing">
  <p>項目1</p>
  <p>項目2</p>
  <p>項目3</p>
</div>
// 對應: space-y-6 sm:space-y-8

// 緊湊項目
<div className="content-spacing-sm">
  <p>項目1</p>
  <p>項目2</p>
</div>
// 對應: space-y-3 sm:space-y-4

// 寬敞項目
<div className="content-spacing-lg">
  <p>項目1</p>
  <p>項目2</p>
</div>
// 對應: space-y-8 sm:space-y-10
```

---

## 按鈕快速參考

### 按鈕變體
```typescript
<Button variant="primary">主要操作</Button>      // 藍色漸進
<Button variant="secondary">次要操作</Button>     // 灰色
<Button variant="outline">邊框動作</Button>      // 藍色邊框
<Button variant="danger">危險操作</Button>       // 紅色
<Button variant="ghost">文本操作</Button>        // 無背景
```

### 按鈕大小
```typescript
<Button size="sm">小按鈕</Button>                 // px-4 py-2
<Button size="md">中等按鈕</Button>               // px-6 py-2.5（預設）
<Button size="lg">大按鈕</Button>                 // px-8 py-3
```

### 按鈕組合
```typescript
<Button variant="primary" size="md">操作</Button>
<Button fullWidth>全寬按鈕</Button>
<Button isLoading>加載中...</Button>
<Button disabled>已禁用</Button>
```

---

## 輸入框參考

### 基本用法
```typescript
<Input 
  label="電子郵件"
  type="email"
  placeholder="example@email.com"
/>

<Input 
  label="密碼"
  error="密碼不符合要求"
  helperText="至少8個字符"
/>
```

### 大小選項
```typescript
<Input size="sm" />        // 小輸入框
<Input size="md" />        // 中等輸入框（預設）
<Input size="lg" />        // 大輸入框
```

---

## 卡片和容器

### 基本卡片
```typescript
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";

<Card>
  <CardHeader>
    <h3>卡片標題</h3>
  </CardHeader>
  <CardBody>
    <p>卡片內容</p>
  </CardBody>
  <CardFooter>
    <Button>操作</Button>
  </CardFooter>
</Card>
```

### 功能卡片
```typescript
<div className="feature-card">
  <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center">
    <Icon className="w-7 h-7 text-blue-600" />
  </div>
  <h3>功能標題</h3>
  <p>功能描述</p>
</div>
```

### 懸停卡片
```typescript
<div className="card-hover">
  <p>會在懸停時提升並添加陰影</p>
</div>
```

---

## 響應式設計模式

### 文本大小
```typescript
<h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl">
  響應式標題
</h1>

<p className="text-sm sm:text-base md:text-lg lg:text-xl">
  響應式段落
</p>
```

### 間距
```typescript
<div className="px-4 sm:px-6 md:px-8 lg:px-10">
  響應式水平內邊距
</div>

<div className="py-6 sm:py-8 md:py-10 lg:py-12">
  響應式垂直內邊距
</div>
```

### 網格和布局
```typescript
// 單列到3列佈局
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
  <Card>卡片1</Card>
  <Card>卡片2</Card>
  <Card>卡片3</Card>
</div>

// Flex 佈局
<div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
  <Button>操作1</Button>
  <Button>操作2</Button>
</div>
```

---

## 顏色和背景

### 背景色
```typescript
<div className="bg-white">白色背景</div>
<div className="bg-gray-50">淺灰色背景</div>
<div className="bg-blue-50">淺藍色背景</div>
<div className="bg-primary-600">主色</div>
```

### 文本色
```typescript
<p className="text-gray-900">深色文本</p>
<p className="text-gray-700">常規文本</p>
<p className="text-gray-500">淺色文本</p>
<p className="text-blue-600">藍色文本</p>
```

### 邊框
```typescript
<div className="border border-gray-200">標準邊框</div>
<div className="border-2 border-blue-600">藍色邊框</div>
<div className="border-b border-gray-100">底部邊框</div>
```

---

## 徽章 (Badge)

### 變體
```typescript
<Badge variant="primary">已批准</Badge>         // 藍色
<Badge variant="success">成功</Badge>          // 綠色
<Badge variant="warning">警告</Badge>          // 黃色
<Badge variant="danger">拒絕</Badge>           // 紅色
<Badge variant="gray">預設</Badge>             // 灰色
```

### 大小
```typescript
<Badge size="sm">小</Badge>                     // px-2.5 py-1
<Badge size="md">中等</Badge>                   // px-3 py-1.5（預設）
<Badge size="lg">大</Badge>                     // px-4 py-2
```

---

## 常見頁面佈局

### 儀表板頁面
```typescript
<DashboardLayout>
  <div className="space-y-8">
    <div>
      <h1>頁面標題</h1>
      <p className="text-gray-600 mt-2">頁面描述</p>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card>
        <CardBody>
          <h5>統計項目</h5>
          <p className="text-2xl font-bold text-blue-600 mt-2">123</p>
        </CardBody>
      </Card>
    </div>
  </div>
</DashboardLayout>
```

### 表單頁面
```typescript
<div className="max-w-xl mx-auto py-12">
  <Card>
    <CardHeader>
      <h2>表單標題</h2>
    </CardHeader>
    <CardBody className="content-spacing">
      <Input label="字段1" />
      <Input label="字段2" />
      <Input label="字段3" />
    </CardBody>
    <CardFooter className="flex gap-4">
      <Button variant="outline">取消</Button>
      <Button variant="primary">提交</Button>
    </CardFooter>
  </Card>
</div>
```

### 列表頁面
```typescript
<div className="space-y-8">
  <div className="flex justify-between items-center">
    <h1>項目列表</h1>
    <Button variant="primary">新增</Button>
  </div>
  
  <div className="space-y-4">
    {items.map(item => (
      <Card key={item.id} className="flex justify-between items-center">
        <div>
          <h5>{item.title}</h5>
          <p className="text-gray-600">{item.description}</p>
        </div>
        <Badge variant="success">{item.status}</Badge>
      </Card>
    ))}
  </div>
</div>
```

---

## 常用類快速查找表

| 目的 | 類名 | 說明 |
|------|------|------|
| 頁面容器 | `container-custom` | max-w-7xl + 響應式 padding |
| 區塊間距 | `section-padding` | 標準區塊間距 |
| 卡片間距 | `card-padding` | 卡片內容間距 |
| 內容間距 | `content-spacing` | 子元素之間的間距 |
| 主按鈕 | `btn-primary` | 藍色漸進按鈕 |
| 次按鈕 | `btn-secondary` | 灰色按鈕 |
| 邊框按鈕 | `btn-outline` | 藍色邊框按鈕 |
| 輸入框 | `input-base` | 標準輸入框樣式 |
| 卡片 | `card-base` | 卡片基礎樣式 |
| 功能卡片 | `feature-card` | 帶圖標的功能卡片 |
| 漸層標題 | `gradient-heading` | 藍色漸進文本 |
| 靜音文本 | `text-muted` | 灰色提示文本 |
| 淡入向上 | `animate-fade-in-up` | 淡入向上動畫 |

---

## 對齐原則

### 左對齊
```typescript
<div className="text-left">文本</div>
```

### 居中
```typescript
<div className="text-center">文本</div>
<div className="flex justify-center">元素</div>
<div className="mx-auto">塊級居中</div>
```

### 右對齊
```typescript
<div className="text-right">文本</div>
<div className="flex justify-end">元素</div>
```

###兩端對齐
```typescript
<div className="flex justify-between">
  <span>左邊</span>
  <span>右邊</span>
</div>
```

---

## 斷點速查表

| 設備 | 前綴 | 寬度 | 使用場景 |
|------|------|------|--------|
| 手機 | 無 | <640px | 預設樣式 |
| 平板 | `sm:` | ≥640px | 橫屏手機/小平板 |
| 筆電 | `md:` | ≥768px | 平板 |
| 桌上 | `lg:` | ≥1024px | 桌面 |
| 大屏 | `xl:` | ≥1280px | 大螢幕 |

### 常見組合
```typescript
// 手機1列，平板2列，桌面3列
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"

// 手機垂直，桌面水平
className="flex flex-col lg:flex-row"

// 組合間距
className="px-4 sm:px-6 lg:px-8"
```

---

## 注意事項

⚠️ **避免使用任意值**

儘量使用預定義的 Tailwind 類，避免任意值如 `text-[23px]` 或 `p-[13px]`，這樣會破壞設計系統的一致性。

```typescript
// ✅ 推薦做法
className="text-base p-3"
className="text-lg p-4"
className="text-xl p-6"
```

⚠️ **始終使用響應式前綴**
```typescript
// ❌ 不好
className="text-lg"

// ✅ 更好
className="text-base sm:text-lg md:text-xl"
```

⚠️ **使用語義化類**
```typescript
// ❌ 避免
className="py-16 px-6"

// ✅ 使用
className="section-padding"
```

---

## 需要幫助？

- 完整文檔：查看 [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)
- 變更日誌：查看 [CHANGELOG_REDESIGN.md](./CHANGELOG_REDESIGN.md)
- 顏色參考：檢查 [tailwind.config.ts](./tailwind.config.ts)
- 全局樣式：查看 [src/app/globals.css](./src/app/globals.css)

---

**最後更新**: 2026年2月12日  
**版本**: 1.0 快速參考
