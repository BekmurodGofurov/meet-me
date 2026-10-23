export default function AdmitPanel({ requests, onAdmit, onReject }) {
  if (!requests || requests.length === 0) return null

  return (
    <div className="admit-panel" role="dialog" aria-label="Join requests">
      <div className="admit-panel__header">
        <span className="admit-panel__badge">{requests.length}</span>
        <span>People waiting to join</span>
      </div>
      <ul className="admit-panel__list">
        {requests.map((req) => (
          <li key={req.requestId} className="admit-panel__item">
            <div className="admit-panel__avatar" aria-hidden="true">
              {req.name.charAt(0).toUpperCase()}
            </div>
            <span className="admit-panel__name" title={req.name}>{req.name}</span>
            <div className="admit-panel__actions">
              <button
                className="admit-panel__btn admit-panel__btn--admit"
                onClick={() => onAdmit(req.requestId)}
                aria-label={`Admit ${req.name}`}
              >
                Admit
              </button>
              <button
                className="admit-panel__btn admit-panel__btn--reject"
                onClick={() => onReject(req.requestId)}
                aria-label={`Decline ${req.name}`}
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
