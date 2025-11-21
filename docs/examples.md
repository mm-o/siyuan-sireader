# 开发示例代码参考

这里保存了一些开发过程中的示例代码，供后续参考。

## 思源主题组件使用示例

### 导入组件

```vue
<script setup lang="ts">
import SyButton from '@/components/SiyuanTheme/SyButton.vue'
import SyCheckbox from '@/components/SiyuanTheme/SyCheckbox.vue'
import SyIcon from '@/components/SiyuanTheme/SyIcon.vue'
import SyInput from '@/components/SiyuanTheme/SyInput.vue'
import SySelect from '@/components/SiyuanTheme/SySelect.vue'
import SyTextarea from '@/components/SiyuanTheme/SyTextarea.vue'
import { ref } from 'vue'
</script>
```

### 示例数据

```typescript
const isChecked = ref(false)
const inputValue = ref('')
const selectValue = ref()
const selectOptions = ref([
  { value: '1', text: 'Option 1' },
  { value: '2', text: 'Option 2' },
  { value: '3', text: 'Option 3' },
])
const textareaValue = ref('')

const showAllValues = () => {
  alert(`
    isChecked: ${isChecked.value}
    inputValue: ${inputValue.value}
    selectValue: ${selectValue.value}
    textareaValue: ${textareaValue.value}
  `)
}
```

### 模板示例

```vue
<template>
  <div class="demo">
    <!-- 文本 -->
    <div>Hello Siyuan.</div>

    <!-- 复选框 -->
    <div class="row">
      Checkbox:
      <SyCheckbox v-model="isChecked" />
      ({{ isChecked ? 'checked' : 'unchecked' }})
    </div>

    <!-- 图标 -->
    <div class="row">
      <SyIcon name="iconSiYuan" />
      <SyIcon name="iconSiYuan" size="20px" />
      <SyIcon name="iconSiYuan" size="30px" />
    </div>

    <!-- 输入框 -->
    <div class="col">
      <SyInput v-model="inputValue" />
      <div>{{ inputValue }}</div>
    </div>

    <!-- 选择框 -->
    <div class="col">
      <SySelect v-model="selectValue" :options="selectOptions" />
      <div>selected value: {{ selectValue }}</div>
      <div>
        selected text: {{ selectOptions.find(option => option.value === selectValue)?.text }}
      </div>
    </div>

    <!-- 文本域 -->
    <div class="col">
      <SyTextarea v-model="textareaValue" />
      <div>{{ textareaValue }}</div>
    </div>

    <!-- 按钮 -->
    <SyButton @click="showAllValues">Show All Values</SyButton>
    <SyButton @click="openSetting">Open Setting</SyButton>
  </div>
</template>
```

## 状态栏示例

### 方法1：使用 Vue Teleport

```vue
<script setup lang="ts">
import { ref, watchEffect, onMounted } from 'vue'
import SyIcon from '@/components/SiyuanTheme/SyIcon.vue'

const statusRef = ref<HTMLDivElement>()

watchEffect(() => {
  console.log('statusRef is ', statusRef.value)
})

onMounted(() => {
  // 延迟绑定，确保状态栏已就绪
  const status = document.getElementById('status') as HTMLDivElement
  if (status) {
    setTimeout(() => {
      statusRef.value = status
    }, 5000)
  }
})
</script>

<template>
  <!-- 使用 Teleport 传送到状态栏 -->
  <Teleport :to="statusRef" v-if="statusRef">
    <SyIcon name="iconHeart" style="color: green;" />
  </Teleport>
</template>
```

### 方法2：使用 Plugin API

```typescript
import { usePlugin } from '@/main'
import { onMounted } from 'vue'

const plugin = usePlugin()

onMounted(() => {
  // 创建状态栏元素
  const tempStatus = document.createElement('div')
  tempStatus.classList.add('temp-status')
  tempStatus.innerHTML = `
    <svg style="width: 12px; height: 12px; color: red;">
      <use xlink:href="#iconHeart"></use>
    </svg>
  `

  // 添加到状态栏
  plugin.addStatusBar({
    element: tempStatus,
    position: 'right',
  })
})
```

## 暴露方法给外部调用

```typescript
onMounted(() => {
  // 将方法挂载到 window 对象，供外部调用
  window._sy_plugin_sample = {}
  window._sy_plugin_sample.openSetting = openSetting
})
```

## 样式示例

```scss
<style lang="scss" scoped>
.plugin-app-main {
  width: 100%;
  height: 100%;
  max-height: 100vh;
  box-sizing: border-box;
  pointer-events: none;

  position: absolute;
  top: 0;
  left: 0;
  z-index: 4;
  display: flex;
  justify-content: center;
  align-items: center;

  .demo {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    pointer-events: auto;
    z-index: 10;

    background-color: var(--b3-theme-surface);
    border-radius: var(--b3-border-radius);
    border: 1px solid var(--b3-border-color);
    padding: 16px;
  }
}
</style>

<style lang="scss">
.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
</style>
```
