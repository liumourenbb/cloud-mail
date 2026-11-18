<template>
  <el-dialog
      v-model="visible"
      class="ai-api-dialog"
      @open="handleOpen"
      @closed="handleClosed"
  >
    <template #header>
      <div class="ai-dialog-head">
        <span class="ai-dialog-title">{{ $t('aiApiTitle') }}</span>
        <el-tooltip effect="dark" :content="$t('aiApiDesc')">
          <Icon class="warning" icon="fe:warning" width="18" height="18"/>
        </el-tooltip>
      </div>
    </template>

    <div class="ai-dialog-body">
      <div class="ai-section-label">{{ $t('aiMcpEndpoint') }}</div>
      <div class="ai-endpoint-row">
        <el-input :model-value="mcpEndpoint" readonly size="small"/>
        <el-button size="small" @click="copyText(mcpEndpoint)">{{ $t('copy') }}</el-button>
      </div>

      <div class="ai-section-label">{{ $t('aiApiKeyLabel') }}</div>
      <div class="ai-key-row">
        <el-input
            :model-value="displayKey"
            :type="keyVisible ? 'text' : 'password'"
            :placeholder="$t('aiApiKeyEmptyTip')"
            readonly
        />
        <el-button v-if="hasKey" @click="toggleReveal" :loading="keyLoading">
          {{ keyVisible ? $t('aiKeyHide') : $t('aiKeyReveal') }}
        </el-button>
        <el-button v-if="hasKey" @click="copyRawKey" :loading="keyLoading">
          {{ $t('copy') }}
        </el-button>
      </div>

      <div class="ai-rotate-row">
        <el-button type="primary" plain size="small" :loading="rotateLoading" @click="handleRotateKey">
          {{ $t('aiKeyRotate') }}
        </el-button>
      </div>

      <div class="ai-snippet-box">
        <div class="ai-snippet-head">
          <span>{{ $t('aiMcpConfigJson') }}</span>
          <el-button link type="primary" size="small" @click="copyMcpConfig">{{ $t('aiCopyConfig') }}</el-button>
        </div>
        <pre>{{ mcpConfigText }}</pre>
      </div>

      <div class="ai-snippet-box">
        <div class="ai-snippet-head">
          <span>{{ $t('aiHttpApiExample') }}</span>
          <el-button link type="primary" size="small" @click="copyCurlExample">{{ $t('aiCopyConfig') }}</el-button>
        </div>
        <pre>{{ curlExampleText }}</pre>
      </div>
    </div>

    <template #footer>
      <div class="ai-dialog-footer">
        <el-switch
            v-model="localStatus"
            :active-value="0"
            :inactive-value="1"
            :active-text="$t('enable')"
            :inactive-text="$t('disable')"
        />
        <el-button :loading="saveLoading" type="primary" @click="handleSave">
          {{ $t('save') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import {computed, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {Icon} from '@iconify/vue';
import {settingAiKeyReveal, settingAiKeyRotate, settingSet} from '@/request/setting.js';

const props = defineProps({
  modelValue: {type: Boolean, default: false},
  aiApiStatus: {type: Number, default: 1},
  maskedKey: {type: String, default: ''}
});

const emit = defineEmits(['update:modelValue', 'saved']);
const {t} = useI18n();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const localStatus = ref(1);
const rawKey = ref('');
const keyVisible = ref(false);
const keyLoading = ref(false);
const rotateLoading = ref(false);
const saveLoading = ref(false);

const hasKey = computed(() => Boolean(rawKey.value || props.maskedKey));
const displayKey = computed(() => (keyVisible.value && rawKey.value ? rawKey.value : (rawKey.value || props.maskedKey || '')));
const originUrl = computed(() => (typeof window !== 'undefined' ? window.location.origin : 'https://your-domain'));
const mcpEndpoint = computed(() => `${originUrl.value}/api/mcp`);

function buildMcpConfig(tokenPlaceholder) {
  return JSON.stringify({
    mcpServers: {
      'cloud-mail': {
        url: mcpEndpoint.value,
        headers: {
          Authorization: `Bearer ${tokenPlaceholder}`
        }
      }
    }
  }, null, 2);
}

function buildCurlExample(tokenPlaceholder) {
  return `curl -X POST "${originUrl.value}/api/public/sendEmail" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -d '{"to":"user@example.com","subject":"Hello","text":"Sent via AI API"}'`;
}

const mcpConfigText = computed(() => buildMcpConfig(keyVisible.value && rawKey.value ? rawKey.value : '<YOUR_AI_API_KEY>'));
const curlExampleText = computed(() => buildCurlExample(keyVisible.value && rawKey.value ? rawKey.value : '<YOUR_AI_API_KEY>'));

function handleOpen() {
  localStatus.value = props.aiApiStatus ?? 1;
  keyVisible.value = false;
  rawKey.value = '';
}

function handleClosed() {
  rawKey.value = '';
  keyVisible.value = false;
}

async function ensureRawKey() {
  if (rawKey.value) return rawKey.value;
  keyLoading.value = true;
  try {
    const res = await settingAiKeyReveal();
    rawKey.value = res?.aiApiKey || '';
    return rawKey.value;
  } finally {
    keyLoading.value = false;
  }
}

async function toggleReveal() {
  if (keyVisible.value) {
    keyVisible.value = false;
    return;
  }
  const key = await ensureRawKey();
  if (key) keyVisible.value = true;
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage({message: t('copySuccessMsg'), type: 'success', plain: true});
  } catch {
    ElMessage({message: t('copyFailMsg'), type: 'error', plain: true});
  }
}

async function copyRawKey() {
  const key = await ensureRawKey();
  if (key) await copyText(key);
}

async function copyMcpConfig() {
  const key = hasKey.value ? (await ensureRawKey() || '<YOUR_AI_API_KEY>') : '<YOUR_AI_API_KEY>';
  await copyText(buildMcpConfig(key));
}

async function copyCurlExample() {
  const key = hasKey.value ? (await ensureRawKey() || '<YOUR_AI_API_KEY>') : '<YOUR_AI_API_KEY>';
  await copyText(buildCurlExample(key));
}

async function handleRotateKey() {
  if (hasKey.value) {
    try {
      await ElMessageBox.confirm(t('aiKeyRotateConfirm'), t('aiApiTitle'), {
        type: 'warning',
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel')
      });
    } catch {
      return;
    }
  }
  rotateLoading.value = true;
  try {
    const res = await settingAiKeyRotate();
    rawKey.value = res?.aiApiKey || '';
    keyVisible.value = true;
    ElMessage({message: t('saveSuccessMsg'), type: 'success', plain: true});
    emit('saved');
  } finally {
    rotateLoading.value = false;
  }
}

async function handleSave() {
  if (saveLoading.value) return;
  saveLoading.value = true;
  try {
    await settingSet({aiApiStatus: localStatus.value});
    ElMessage({message: t('saveSuccessMsg'), type: 'success', plain: true});
    emit('saved');
    visible.value = false;
  } finally {
    saveLoading.value = false;
  }
}
</script>

<style scoped lang="scss">
.ai-dialog-head {
  display: flex;
  align-items: center;
  gap: 5px;
}

.ai-dialog-title {
  font-size: 18px;
  font-weight: bold;
}

.warning {
  color: grey;
  cursor: pointer;
}

.ai-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.ai-endpoint-row,
.ai-key-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ai-rotate-row {
  display: flex;
  justify-content: flex-start;
}

.ai-snippet-box {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;

  pre {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--el-text-color-primary);
  }
}

.ai-snippet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.ai-dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

:deep(.ai-api-dialog.el-dialog) {
  width: min(560px, calc(100vw - 40px)) !important;
}
</style>
