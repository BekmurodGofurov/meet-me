export default function Logo({ size = 32, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`meet-me-logo ${className}`}
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M26 24C17.1634 24 10 31.1634 10 40V60C10 68.8366 17.1634 76 26 76H56C64.8366 76 72 68.8366 72 60V58.3754L85.6669 66.8043C88.9482 68.8267 93 66.4716 93 62.6163V37.3837C93 33.5284 88.9482 31.1733 85.6669 33.1957L72 41.6246V40C72 31.1634 64.8366 24 56 24H26ZM41 38C34.3726 38 29 43.3726 29 50C29 56.6274 34.3726 62 41 62C47.6274 62 53 56.6274 53 50C53 43.3726 47.6274 38 41 38Z"
        fill="currentColor"
      />
    </svg>
  )
}
