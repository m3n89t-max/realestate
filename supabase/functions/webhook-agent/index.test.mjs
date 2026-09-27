import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceUrl = new URL('./index.ts', import.meta.url)

function createAdminClient(seed, operations = []) {
  return {
    from(table) {
      const state = { table, action: 'select', filters: [], payload: undefined }
      const builder = {
        select() { return builder },
        update(payload) { state.action = 'update'; state.payload = payload; return builder },
        insert(payload) { state.action = 'insert'; state.payload = payload; return builder },
        eq(column, value) { state.filters.push({ type: 'eq', column, value }); return builder },
        in(column, values) { state.filters.push({ type: 'in', column, values }); return builder },
        lte(column, value) { state.filters.push({ type: 'lte', column, value }); return builder },
        order() { return builder },
        limit() { return builder },
        single() { return execute(true) },
        then(resolve, reject) { return execute(false).then(resolve, reject) },
      }

      async function execute(single) {
        operations.push({ ...state, filters: [...state.filters] })
        const forcedError = seed.__errors?.[`${table}:${state.action}`]
        if (forcedError) return { data: null, error: { message: forcedError } }
        let rows = [...(seed[table] ?? [])]
        for (const filter of state.filters) {
          if (filter.type === 'eq') rows = rows.filter(row => row[filter.column] === filter.value)
          if (filter.type === 'in') rows = rows.filter(row => filter.values.includes(row[filter.column]))
          if (filter.type === 'lte') rows = rows.filter(row => row[filter.column] <= filter.value)
        }
        if (state.action === 'update') {
          for (const row of rows) Object.assign(row, state.payload)
        } else if (state.action === 'insert') {
          const inserted = Array.isArray(state.payload) ? state.payload : [state.payload]
          seed[table] = [...(seed[table] ?? []), ...inserted]
          rows = inserted
        }
        if (single) {
          return rows.length === 1
            ? { data: rows[0], error: null }
            : { data: null, error: { message: `Expected one row, found ${rows.length}` } }
        }
        return { data: rows, error: null }
      }
      return builder
    },
    async rpc() { return { data: null, error: null } },
  }
}

async function loadHandler(adminClient, fetchCalls) {
  const source = await readFile(sourceUrl, 'utf8')
  const executable = source
    .replace(/^import .*$/gm, '')
    .replace('Deno.serve(async (req) => {', 'Deno.serve(async (req) => {')
  let handler
  const Deno = {
    env: { get: () => 'test-value' },
    serve(fn) { handler = fn },
  }
  const createClient = () => adminClient
  const corsHeaders = {}
  const handleCors = () => null
  const fetch = async (...args) => {
    fetchCalls.push(args)
    return new Response(null, { status: 200 })
  }
  const testConsole = { ...console, error() {}, warn() {} }
  new Function('Deno', 'createClient', 'corsHeaders', 'handleCors', 'fetch', 'console', executable)(
    Deno, createClient, corsHeaders, handleCors, fetch, testConsole,
  )
  return handler
}

async function invoke(seed, body, operations = []) {
  const fetchCalls = []
  const handler = await loadHandler(createAdminClient(seed, operations), fetchCalls)
  const response = await handler(new Request('http://localhost/webhook-agent', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
  return { response, json: await response.json(), operations, fetchCalls }
}

test('get_content rejects content belonging to another tenant', async () => {
  const seed = {
    agent_connections: [{ id: 'agent-a', org_id: 'org-a', agent_key: 'key-a', status: 'online' }],
    generated_contents: [{ id: 'content-b', org_id: 'org-b', title: 'private', content: 'secret', tags: [] }],
  }

  const { response, json } = await invoke(seed, {
    event: 'get_content',
    agent_key: 'key-a',
    content_id: 'content-b',
  })

  assert.equal(response.status, 400)
  assert.match(json.error, /찾을 수 없습니다/)
})

for (const event of ['task_progress', 'task_completed', 'task_failed']) {
  test(`${event} rejects foreign, unowned, and terminal tasks without logging`, async () => {
    for (const task of [
      { id: 'task-x', org_id: 'org-b', agent_id: 'agent-a', status: 'running', retry_count: 0, max_retries: 3 },
      { id: 'task-x', org_id: 'org-a', agent_id: 'agent-b', status: 'running', retry_count: 0, max_retries: 3 },
      { id: 'task-x', org_id: 'org-a', agent_id: 'agent-a', status: 'success', retry_count: 0, max_retries: 3 },
    ]) {
      const seed = {
        agent_connections: [{ id: 'agent-a', org_id: 'org-a', agent_key: 'key-a', status: 'online' }],
        tasks: [task],
        task_logs: [],
      }
      const { response } = await invoke(seed, {
        event,
        agent_key: 'key-a',
        task_id: 'task-x',
        message: 'progress',
        result: {},
        error_code: 'FAILED',
        error_message: 'failed',
        retry: false,
      })

      assert.equal(response.status, 400, `${event} accepted ${JSON.stringify(task)}`)
      assert.deepEqual(seed.task_logs, [])
    }
  })
}

test('building-register completion rejects a foreign document before completing the task', async () => {
  const seed = {
    agent_connections: [{ id: 'agent-a', org_id: 'org-a', agent_key: 'key-a' }],
    tasks: [{ id: 'task-a', org_id: 'org-a', project_id: 'project-a', agent_id: 'agent-a', status: 'running', type: 'building_register' }],
    documents: [{ id: 'document-b', org_id: 'org-b', project_id: 'project-b' }],
    task_logs: [],
  }
  const { response, fetchCalls } = await invoke(seed, {
    event: 'task_completed', agent_key: 'key-a', task_id: 'task-a', result: { document_id: 'document-b' },
  })
  assert.equal(response.status, 400)
  assert.equal(seed.tasks[0].status, 'running')
  assert.deepEqual(seed.task_logs, [])
  assert.deepEqual(fetchCalls, [])
})

test('document_uploaded rejects a project belonging to another tenant', async () => {
  const seed = {
    agent_connections: [{ id: 'agent-a', org_id: 'org-a', agent_key: 'key-a' }],
    projects: [{ id: 'project-b', org_id: 'org-b' }],
    documents: [],
  }
  const { response } = await invoke(seed, {
    event: 'document_uploaded', agent_key: 'key-a', project_id: 'project-b',
    document_type: 'building_register', file_url: 'https://example.test/doc', file_name: 'doc.pdf',
  })
  assert.equal(response.status, 400)
  assert.deepEqual(seed.documents, [])
})

test('content updates and asset reads reject resources belonging to another tenant', async () => {
  const baseAgent = [{ id: 'agent-a', org_id: 'org-a', agent_key: 'key-a' }]
  const contentSeed = {
    agent_connections: baseAgent,
    generated_contents: [{ id: 'content-b', org_id: 'org-b', title: 'private' }],
  }
  const contentResult = await invoke(contentSeed, {
    event: 'update_content', agent_key: 'key-a', content_id: 'content-b', updates: { title: 'stolen' },
  })
  assert.equal(contentResult.response.status, 400)
  assert.equal(contentSeed.generated_contents[0].title, 'private')

  const assetSeed = {
    agent_connections: baseAgent,
    projects: [{ id: 'project-b', org_id: 'org-b' }],
    assets: [{ project_id: 'project-b', org_id: 'org-b', type: 'image', file_url: 'private' }],
  }
  const assetResult = await invoke(assetSeed, {
    event: 'get_assets', agent_key: 'key-a', project_id: 'project-b',
  })
  assert.equal(assetResult.response.status, 400)
})

test('content updates cannot move content to another tenant', async () => {
  const seed = {
    agent_connections: [{ id: 'agent-a', org_id: 'org-a', agent_key: 'key-a' }],
    generated_contents: [{ id: 'content-a', org_id: 'org-a', project_id: 'project-a', is_published: false }],
  }
  const { response } = await invoke(seed, {
    event: 'update_content', agent_key: 'key-a', content_id: 'content-a',
    updates: { org_id: 'org-b', project_id: 'project-b', is_published: true },
  })
  assert.equal(response.status, 200)
  assert.equal(seed.generated_contents[0].org_id, 'org-a')
  assert.equal(seed.generated_contents[0].project_id, 'project-a')
  assert.equal(seed.generated_contents[0].is_published, true)
})

test('task start and claim reject tasks belonging to another tenant', async () => {
  for (const event of ['task_started', 'claim_task']) {
    const seed = {
      agent_connections: [{ id: 'agent-a', org_id: 'org-a', agent_key: 'key-a' }],
      tasks: [{ id: 'task-b', org_id: 'org-b', status: 'pending', agent_id: null }],
      task_logs: [],
    }
    const { response, json } = await invoke(seed, { event, agent_key: 'key-a', task_id: 'task-b' })
    if (event === 'claim_task') {
      assert.equal(json.claimed, false)
    } else {
      assert.equal(response.status, 400)
      assert.deepEqual(seed.task_logs, [])
    }
  }
})

test('valid same-tenant task callbacks remain successful', async () => {
  for (const [event, expectedStatus] of [
    ['task_started', 'running'],
    ['task_progress', 'running'],
    ['task_completed', 'success'],
    ['task_failed', 'failed'],
  ]) {
    const seed = {
      agent_connections: [{ id: 'agent-a', org_id: 'org-a', agent_key: 'key-a' }],
      tasks: [{ id: 'task-a', org_id: 'org-a', agent_id: 'agent-a', status: 'running', type: 'naver_upload', retry_count: 0, max_retries: 3 }],
      task_logs: [],
    }
    const { response } = await invoke(seed, {
      event, agent_key: 'key-a', task_id: 'task-a', message: 'working', result: { ok: true },
      error_code: 'FAILED', error_message: 'failed', retry: false,
    })
    assert.equal(response.status, 200, event)
    assert.equal(seed.tasks[0].status, expectedStatus, event)
    assert.equal(seed.task_logs.length, 1, event)
  }
})

test('database errors are returned instead of false success', async () => {
  for (const [event, table, action, extra] of [
    ['heartbeat', 'agent_connections', 'update', {}],
    ['update_content', 'generated_contents', 'update', { content_id: 'content-a', updates: { is_published: true } }],
    ['get_assets', 'projects', 'select', { project_id: 'project-a' }],
    ['get_pending_tasks', 'tasks', 'select', {}],
    ['get_recent_tasks', 'tasks', 'select', {}],
    ['claim_task', 'tasks', 'update', { task_id: 'task-a' }],
  ]) {
    const seed = {
      __errors: { [`${table}:${action}`]: 'database unavailable' },
      agent_connections: [{ id: 'agent-a', org_id: 'org-a', agent_key: 'key-a' }],
      projects: [{ id: 'project-a', org_id: 'org-a' }],
      generated_contents: [{ id: 'content-a', org_id: 'org-a' }],
      tasks: [{ id: 'task-a', org_id: 'org-a', status: 'pending' }],
    }
    const { response } = await invoke(seed, { event, agent_key: 'key-a', ...extra })
    assert.equal(response.status, 400, `${event} reported success after a database error`)
  }
})
