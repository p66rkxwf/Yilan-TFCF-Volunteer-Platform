# 宜蘭TFCF志工平台 - 設計系統文檔

## 概述

已完成版面重新規劃，包含3個主要改進領域：

1. **排版系統** - 統一的字體大小層級和行高規範
2. **間距系統** - 標準化的間距規則
3. **視覺組件** - 優化的按鈕、卡片、輸入框等

---

## 1. 排版系統 (Typography)

### 標題層級

本系統使用6級標題系統，每級都有響應式字體大小和行高。

| 標籤 | 桌面版本 | 手機版本 | 用途 |
|------|--------|--------|------|
| `<h1>` | 3xl-5xl | 3xl-4xl | 頁面主標題 |
| `<h2>` | 3xl-4xl | 2xl-3xl | 區塊/頁面副標題 |
| `<h3>` | 2xl-3xl | xl-2xl | 章節標題 |
| `<h4>` | xl-2xl | lg-xl | 小章節標題 |
| `<h5>` | lg-xl | base-lg | 卡片標題 |
| `<h6>` | base-lg | sm-base | 輔助標題 |

### 文本樣式

```tsx
// 常規段落—預設樣式滿足大多數文案
<p>文本內容</p>

// 小文本
<small>次要文本</small>
// 或使用 class
<p className="text-sm">次要文本</p>

// 超小文本
<p className="text-xs">更小的文本</p>

// 標籤
<label>表單標籤</label>

// 靜音文本（灰色）
<p className="text-muted">提示文本</p>

// 細微文本（更淺灰色）
<p className="text-subtle">細微提示</p>
```

### 行高和字母間距

系統提供預設的行高值：
- `leading-tight` (1.2) - 緊湊標題
- `leading-snug` (1.35) - 標題
- `leading-normal` (1.5) - 預設段落
- `leading-relaxed` (1.65) - 寬鬆段落
- `leading-loose` (2) - 最寬鬆

---

## 2. 間距系統 (Spacing)

### 區塊間距

```tsx
// 標準區塊間距（適合大多數內容區塊）
<section className="section-padding">
  {/* 內容：py-12-24 視螢幕大小 */}
</section>

// 小區塊間距（側邊欄、卡片等）
<section className="section-padding-sm">
  {/* 內容：py-8-14 視螢幕大小 */}
</section>

// 大區塊間距（Hero、CTA區塊）
<section className="section-padding-lg">
  {/* 內容：py-16-32 視螢幕大小 */}
</section>
```

### 卡片內間距

```tsx
// 標準卡片內間距
<div className="card-padding">
  {/* px/py = 4-8 視螢幕大小 */}
</div>

// 小卡片內間距
<div className="card-padding-sm">
  {/* px/py = 3-6 視螢幕大小 */}
</div>

// 大卡片內間距
<div className="card-padding-lg">
  {/* px/py = 6-10 視螢幕大小 */}
</div>
```

### 內容間距（元素之間）

```tsx
// 標準內容間距—應用於子元素之間
<div className="content-spacing">
  <p>段落 1</p>
  <p>段落 2</p>
  {/* gap = 6-8 視螢幕大小 */}
</div>

// 小內容間距
<div className="content-spacing-sm">
  {/* gap = 3-4 視螢幕大小 */}
</div>

// 大內容間距
<div className="content-spacing-lg">
  {/* gap = 8-10 視螢幕大小 */}
</div>
```

### 網格間距

```tsx
// 使用預定義的網格間距
<div className="grid grid-cols-1 md:grid-cols-3 grid-gap-base">
  {/* gap = 4-8 視螢幕大小 */}
</div>

// 小間距
<div className="grid grid-cols-1 md:grid-cols-3 grid-gap-sm">
  {/* gap = 3-4 視螢幕大小 */}
</div>

// 大間距
<div className="grid grid-cols-1 md:grid-cols-3 grid-gap-lg">
  {/* gap = 6-10 視螢幕大小 */}
</div>
```

---

## 3. 顏色系統

### 主色系

| 名稱 | 用途 |
|------|------|
| `primary-*` | 主要操作、按鈕、重點 |
| `secondary-*` | 文本、背景、中性元素 |
| `accent-*` | 強調、高亮 |

### 使用範例

```tsx
// 背景色
<div className="bg-primary-50">淺色背景</div>

// 文本色
<p className="text-secondary-700">主要文本</p>

// 邊框
<div className="border border-gray-200">邊框容器</div>
```

---

## 4. 按鈕系統

### 按鈕樣式和大小

```tsx
import { Button } from "@/components/ui/button";

// 主要按鈕
<Button variant="primary" size="md">
  操作
</Button>

// 按鈕變體
<Button variant="secondary">次要按鈕</Button>
<Button variant="outline">外框按鈕</Button>
<Button variant="danger">危險操作</Button>
<Button variant="ghost">幽靈按鈕</Button>

// 按鈕大小
<Button size="sm">小</Button>
<Button size="md">中（預設）</Button>
<Button size="lg">大</Button>

// 完整寬度
<Button fullWidth>全寬按鈕</Button>

// 加載狀態
<Button isLoading={true}>處理中...</Button>
```

### 舊按鈕類名 vs 新類名

| 舊類名 | 新類名 |
|-------|-------|
| `.btn-primary` | `.btn-primary` ✅ |
| `.btn-secondary` | `.btn-secondary` ✅ |
| `.btn-outline` | `.btn-outline` ✅ |
| （無） | `.btn-primary-sm` |
| （無） | `.btn-primary-lg` |
| （無） | `.btn-danger` |
| （無） | `.btn-ghost` |

---

## 5. 輸入框和表單

### 輸入框

```tsx
import { Input } from "@/components/ui/input";

// 基礎輸入框
<Input 
  label="電子郵件"
  placeholder="輸入電子郵件"
  error={errors.email}
  helperText="請輸入有效的電子郵件"
/>

// 大小選項
<Input size="sm" placeholder="小輸入框" />
<Input size="md" placeholder="中等輸入框（預設）" />
<Input size="lg" placeholder="大輸入框" />

// 錯誤狀態
<Input 
  error="此欄位為必填"
  defaultValue="value"
/>
```

---

## 6. 卡片組件

### 卡片結構

```tsx
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";

<Card>
  <CardHeader>
    <h3>卡片標題</h3>
  </CardHeader>
  <CardBody>
    <p>卡片內容</p>
  </CardBody>
  <CardFooter>
    <button>操作按鈕</button>
  </CardFooter>
</Card>
```

### 卡片樣式類

```tsx
// 懸停效果卡片
<div className="card-hover">
  內容
</div>

// 功能卡片（帶圖標）
<div className="feature-card">
  <div className="w-14 h-14 bg-blue-100 rounded-lg">
    <Icon />
  </div>
  <h3>功能標題</h3>
  <p>功能描述</p>
</div>

// 小功能卡片
<div className="feature-card-sm">
  內容
</div>
```

---

## 7. 徽章 (Badge)

### 使用方式

```tsx
import { Badge } from "@/components/ui/badge";

// 預設徽章（中等大小）
<Badge variant="primary">已批准</Badge>

// 徽章變體
<Badge variant="primary">主要</Badge>
<Badge variant="success">成功</Badge>
<Badge variant="warning">警告</Badge>
<Badge variant="danger">危險</Badge>
<Badge variant="gray">默認</Badge>

// 大小選項
<Badge size="sm">小</Badge>
<Badge size="md">中（預設）</Badge>
<Badge size="lg">大</Badge>
```

---

## 8. 響應式設計原則

### 移動優先設計

所有組件都遵循移動優先的方法：

```tsx
// 預設為手機，然後在更大螢幕上提升
<div className="text-sm sm:text-base md:text-lg lg:text-xl">
  響應式文本
</div>

// 圖標大小
<Icon className="w-5 h-5 md:w-6 md:h-6" />

// Padding響應
<div className="px-4 sm:px-6 lg:px-8">
  響應式內邊距
</div>
```

### 斷點

| 前綴 | 最小寬度 |
|------|--------|
| 無 | 0px |
| `sm:` | 640px |
| `md:` | 768px |
| `lg:` | 1024px |
| `xl:` | 1280px |

---

## 9. 特殊類和工具

### 漸層類

```tsx
// 漸層標題
<h2 className="gradient-heading">標題</h2>

// 漸層文本
<p className="gradient-text">文本</p>
```

### 邊框和分隔線

```tsx
<div className="border-light">淺邊框</div>
<div className="border-normal">標準邊框</div>
<hr className="divider" />
<hr className="divider-thick" />
```

### 陰影級別

```tsx
<div className="shadow-elevation-1">微弱陰影</div>
<div className="shadow-elevation-2">輕微陰影</div>
<div className="shadow-elevation-3">中等陰影</div>
<div className="shadow-elevation-4">強陰影</div>
```

### 動畫

```tsx
// 淡出向上
<div className="animate-fade-in-up">內容</div>

// 滑動進來
<div className="animate-slide-in-left">內容</div>

// 輕柔脈衝
<div className="animate-pulse-soft">內容</div>
```

---

## 10. 實際範例

### 完整表單示例

```tsx
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";

export function RegisterForm() {
  return (
    <Card>
      <CardHeader>
        <h3>志工註冊</h3>
      </CardHeader>
      <CardBody className="content-spacing">
        <Input 
          label="姓名"
          placeholder="請輸入您的姓名"
        />
        <Input 
          label="電子郵件"
          type="email"
          placeholder="請輸入電子郵件"
        />
        <Input 
          label="電話號碼"
          type="tel"
          placeholder="請輸入電話號碼"
        />
      </CardBody>
      <CardFooter>
        <Button variant="primary" fullWidth>
          提交註冊
        </Button>
      </CardFooter>
    </Card>
  );
}
```

### 仪表板頂部區塊

```tsx
<section className="section-padding bg-linear-to-b from-blue-50 to-white">
  <div className="container-custom">
    <h1 className="gradient-heading mb-4">歡迎回來</h1>
    <p className="text-base sm:text-lg text-gray-700">
      您有 3 個待審批的報名申請
    </p>
    
    <div className="grid grid-cols-1 md:grid-cols-3 grid-gap-base mt-8">
      <Card>
        <CardBody>
          <h5>總服務時數</h5>
          <p className="text-2xl font-bold text-blue-600 mt-2">120 小時</p>
        </CardBody>
      </Card>
      {/* 更多卡片... */}
    </div>
  </div>
</section>
```

---

## 11. 遷移指南

### 從舊樣式系統升級

如果您有現有代碼使用舊的類名或樣式，以下是遷移步驟：

1. **檢查舊類名**
   - `section-padding` → 保持不變（添加了 `section-padding-sm/lg`）
   - 直接 Tailwind 樣式 → 使用新的語義類

2. **更新間距**
   - 改為使用 `content-spacing`、`card-padding` 等
   - 而不是直接的 `gap`、`px`、`py`

3. **優化文本大小**
   - 使用 `text-xs`, `text-sm`, `text-base` 等
   - 而不是像 `text-12px` 這樣的任意值

4. **使用響應式類**
   - 總是使用 `sm:`, `md:`, `lg:` 前綴
   - 遵循移動優先的方法

---

## 12. 最佳實踐

### ✅ DO（應做）

- 使用語義化的類名（`.btn-primary`, `.card-padding`）
- 遵循行高和字母間距的預設值
- 使用響應式前綴進行移動首先設計
- 保持一致的間距（使用定義的間距類）
- 在陰影上使用 `.shadow-elevation-*`

### ❌ DON'T（不應做）

- 避免使用任意的大小值（如 `text-[37px]`）
- 不直接使用顏色值（使用 Color 變量）
- 不混合舊和新之間的類命名約定
- 避免過度嵌套間距
- 不添加多個陰影類

---

## 其他資源

- Tailwind CSS 文檔：https://tailwindcss.com
- 項目 Git 倉庫：https://github.com/p66rk/yilan-TFCF-volunteer-platform
- 反饋和改進：提交 Issue 或 Pull Request

---

**最後更新：2026年2月12日**
**版本：1.0**
