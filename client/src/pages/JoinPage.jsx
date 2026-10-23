import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export default function JoinPage({ onResolveInvite, resolvedRoomId, resolveError }) {
  const { token } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (token && onResolveInvite) {
      onResolveInvite(token)
    }
  }, [token, onResolveInvite])

  useEffect(() => {
    if (resolvedRoomId) {
      // Navigate to lobby with the resolved roomId prefilled
      navigate(`/lobby?action=join&roomId=${resolvedRoomId}`, { replace: true })
    }
  }, [resolvedRoomId, navigate])

  if (resolveError) {
    return (
      <div className="not-found">
        <div className="not-found__code">🔗</div>
        <h1 className="not-found__title">Invalid invite link</h1>
        <p className="not-found__sub">{resolveError}</p>
        <button onClick={() => navigate('/')}>Go home</button>
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
