import test from 'node:test'
import assert from 'node:assert/strict'
import { uploadProjectAssets, type ProjectAssetUploadOperations } from '../src/lib/project-asset-upload'

const file = (name: string, type = 'image/jpeg') => ({ name, type, size: 10 }) as File

function operations(overrides: Partial<ProjectAssetUploadOperations> = {}): ProjectAssetUploadOperations {
  return {
    makePath: (input) => input.name,
    upload: async () => true,
    publicUrl: (path) => `https://example.test/${path}`,
    registerAsset: async ({ file: input }) => ({ assetId: `asset-${input.name}`, isCover: input.type.startsWith('image/') }),
    deleteStorage: async () => true,
    ...overrides,
  }
}

test('각 파일 예외를 분리하고 혼합 결과도 입력 순서 그대로 돌려준다', async () => {
  const first = file('first.jpg')
  const second = file('second.jpg')
  const third = file('third.jpg', 'video/mp4')
  const uploaded: string[] = []
  const result = await uploadProjectAssets([first, second, third], operations({
    upload: async (path) => { uploaded.push(path); if (path === 'second.jpg') throw new Error('network') ; return true },
  }))

  assert.deepEqual(uploaded, ['first.jpg', 'second.jpg', 'third.jpg'])
  assert.deepEqual(result.map((item) => [item.file.name, item.success]), [['first.jpg', true], ['second.jpg', false], ['third.jpg', true]])
})

test('파일은 선택 순서대로 등록하고 정렬 번호는 DB가 배정한다', async () => {
  const registered: Array<{ file: File; url: string }> = []
  await uploadProjectAssets([file('first.jpg'), file('second.jpg')], operations({
    registerAsset: async (input) => {
      registered.push(input)
      return { assetId: `asset-${input.file.name}`, isCover: input.file.name === 'first.jpg' }
    },
  }))

  assert.deepEqual(registered.map((input) => input.file.name), ['first.jpg', 'second.jpg'])
  assert.deepEqual(registered.map((input) => Object.keys(input).sort()), [
    ['file', 'url'],
    ['file', 'url'],
  ])
})

test('RPC 등록 예외 뒤 저장소를 정리하고 다음 파일을 계속 처리한다', async () => {
  const first = file('first.jpg')
  const second = file('second.jpg')
  const deleted: string[] = []
  const result = await uploadProjectAssets([first, second], operations({
    registerAsset: async ({ file: input }) => { if (input.name === 'first.jpg') throw new Error('db'); return { assetId: `asset-${input.name}`, isCover: true } },
    deleteStorage: async (path) => { deleted.push(path); return true },
  }))

  assert.deepEqual(result.map((item) => item.success), [false, true])
  assert.deepEqual(deleted, ['first.jpg'])
})

test('RPC 등록 실패 후 저장소 정리에 실패하면 재시도를 막는다', async () => {
  const result = await uploadProjectAssets([file('orphan.jpg')], operations({
    registerAsset: async () => { throw new Error('db') },
    deleteStorage: async () => false,
  }))

  assert.equal(result[0].success, false)
  assert.equal(result[0].retryable, false)
  assert.match(result[0].error ?? '', /매물 상세에서 확인해 주세요/)
})
