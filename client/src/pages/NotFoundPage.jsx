import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="not-found">
      <div className="not-found__code">404</div>
      <h1 className="not-found__title">Page not found</h1>
      <p className="not-found__sub">This page doesn't exist or the meeting link has expired.</p>
      <button onClick={() => navigate('/')}>Go home</button>
    </div>
  )
}
