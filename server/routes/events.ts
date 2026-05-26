import { Router } from 'express'
import { addSSEClient, removeSSEClient } from '../sseEmitter'

const router = Router()

router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  res.write('event: connected\ndata: {}\n\n')

  addSSEClient(res)
  req.on('close', () => removeSSEClient(res))

  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch { clearInterval(hb) }
  }, 30_000)
  req.on('close', () => clearInterval(hb))
})

export default router
