export default function WaitingRoom({ name, onCancel }) {
  return (
    <div className="waiting-room">
      <div className="waiting-room__spinner" aria-hidden="true">
        <div className="waiting-room__dot" />
        <div className="waiting-room__dot" />
        <div className="waiting-room__dot" />
      </div>
      <h2 className="waiting-room__title">Waiting for host to admit you</h2>
      <p className="waiting-room__sub">
        Hi <strong>{name}</strong>! Your request to join has been sent to the host. You will automatically enter when admitted.
      </p>
      <button className="is-secondary" onClick={onCancel}>
        Cancel request
      </button>
    </div>
  )
}
