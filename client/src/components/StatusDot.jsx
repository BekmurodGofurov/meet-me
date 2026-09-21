export default function StatusDot({ status }) {
  return <span className={`status-dot status-dot--${status}`} title={`Server: ${status}`} />
}
