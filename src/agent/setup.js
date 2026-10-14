const jipporter = window.jipporter
const agentKeyInput = document.getElementById('agent_key')
const agentNameInput = document.getElementById('agent_name')
const toggleButton = document.getElementById('toggleAgentKey')
const saveButton = document.getElementById('saveButton')
const errorElement = document.getElementById('error')

function showError(message) {
  errorElement.textContent = message
  errorElement.classList.add('visible')
}

function clearError() {
  errorElement.textContent = ''
  errorElement.classList.remove('visible')
}

toggleButton.addEventListener('click', () => {
  const showing = agentKeyInput.type === 'text'
  agentKeyInput.type = showing ? 'password' : 'text'
  toggleButton.textContent = showing ? '표시' : '숨김'
  toggleButton.setAttribute('aria-pressed', String(!showing))
})

saveButton.addEventListener('click', async () => {
  clearError()
  const agentKey = agentKeyInput.value.trim()
  if (!agentKey) {
    showError('에이전트 연결키를 입력해 주세요.')
    return
  }
  saveButton.disabled = true
  saveButton.textContent = '저장 중...'
  try {
    const result = await jipporter.saveConfig({
      agent_key: agentKey,
      agent_name: agentNameInput.value.trim(),
    })
    agentKeyInput.value = ''
    agentKeyInput.type = 'password'
    toggleButton.textContent = '표시'
    toggleButton.setAttribute('aria-pressed', 'false')
    if (!result.ok) throw new Error(result.error || '설정을 저장하지 못했습니다.')
    const started = await jipporter.finishSetup()
    if (!started?.ok) throw new Error(started?.error || '에이전트를 시작하지 못했습니다.')
    document.getElementById('setupPanel').classList.add('hidden')
    document.getElementById('donePanel').classList.remove('hidden')
  } catch (error) {
    showError(error instanceof Error ? error.message : '설정을 저장하지 못했습니다.')
    saveButton.disabled = false
    saveButton.textContent = '안전하게 저장하고 시작'
  }
})
