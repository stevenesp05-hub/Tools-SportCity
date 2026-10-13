/// <reference lib="webworker" />
import nspell from 'nspell'

type NSpell = ReturnType<typeof nspell>

export type WorkerRequest =
  | { type: 'init'; affUrl: string; dicUrl: string; extra: string[] }
  | { type: 'check'; id: number; words: string[] }
  | { type: 'suggest'; id: number; word: string }
  | { type: 'add'; word: string }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'checked'; id: number; wrong: string[] }
  | { type: 'suggestions'; id: number; list: string[] }

let speller: NSpell | null = null
const queue: WorkerRequest[] = []

async function init(msg: Extract<WorkerRequest, { type: 'init' }>) {
  const [aff, dic] = await Promise.all([
    fetch(msg.affUrl).then((r) => r.text()),
    fetch(msg.dicUrl).then((r) => r.text()),
  ])
  speller = nspell(aff, dic)
  for (const word of msg.extra) speller.add(word)
  postMessage({ type: 'ready' } satisfies WorkerResponse)
  for (const pending of queue.splice(0)) handle(pending)
}

function handle(msg: WorkerRequest) {
  if (msg.type === 'init') {
    void init(msg)
    return
  }
  if (!speller) {
    queue.push(msg)
    return
  }
  if (msg.type === 'add') {
    speller.add(msg.word)
  } else if (msg.type === 'check') {
    const wrong = msg.words.filter((w) => !speller!.correct(w))
    postMessage({
      type: 'checked',
      id: msg.id,
      wrong,
    } satisfies WorkerResponse)
  } else if (msg.type === 'suggest') {
    postMessage({
      type: 'suggestions',
      id: msg.id,
      list: speller.suggest(msg.word).slice(0, 5),
    } satisfies WorkerResponse)
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) =>
  handle(event.data),
)
