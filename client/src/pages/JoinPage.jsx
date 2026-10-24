import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LinkIcon } from '../components/icons'

export default function JoinPage({ onResolveInvite, resolvedRoomId, resolveError }) {
  const { token } = useParams()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (token && onResolveInvite) {
      onResolveInvite(token)
    }
  }, [token, onResolveInvite, retryCount])

  useEffect(() => {
    if (resolvedRoomId) {
      // Navigate to lobby with the resolved roomId prefilled
      navigate(`/lobby?action=join&roomId=${resolvedRoomId}`, { replace: true })
    }
  }, [resolvedRoomId, navigate])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!resolvedRoomId && !resolveError) {
        setTimedOut(true)
      }
    }, 7000)
    return () => clearTimeout(timer)
  }, [resolvedRoomId, resolveError, retryCount])

  if (resolveError || timedOut) {
    const errorMsg =
      resolveError ||
      'Connection timed out. The invite link may have expired or the host is no longer in the room.'

    return (
      <div className="not-found">
        <div className="not-found__icon">
          <LinkIcon width={34} height={34} />
        </div>
        <h1 className="not-found__title">Unable to join</h1>
        <p className="not-found__sub">{errorMsg}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          {timedOut && !resolveError && (
            <button
              onClick={() => {
                setTimedOut(false)
                setRetryCount((c) => c + 1)
              }}
            >
              Retry
            </button>
          )}
          <button
            className={timedOut && !resolveError ? 'is-secondary' : ''}
            onClick={() => navigate('/')}
          >
            Go home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="join-loading">
      <div className="waiting-room__spinner" aria-hidden="true">
        <div className="waiting-room__dot" />
        <div className="waiting-room__dot" />
        <div className="waiting-room__dot" />
      </div>
      <p>Connecting to invite link...</p>
    </div>
  )
}
