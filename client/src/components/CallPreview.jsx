import { CameraIcon, LeaveIcon, MicIcon, ScreenShareIcon } from './icons'

const PEOPLE = [
  { name: 'Aziza', hue: 255, speaking: true },
  { name: 'Jasur', hue: 330 },
  { name: 'Madina', hue: 175 },
  { name: 'You', hue: 285 },
]

// A picture of the in-call screen for the landing hero. It is decoration, so
// it is hidden from assistive tech and its "buttons" are plain spans that can't
// take focus.
export default function CallPreview() {
  return (
    <div className="call-preview" aria-hidden="true">
      <div className="call-preview__bar">
        <span className="call-preview__room">
          <span className="call-preview__live" />
          Room a7k2xq
        </span>
        <span>4 people</span>
      </div>

      <div className="call-preview__grid">
        {PEOPLE.map((person) => (
          <div
            key={person.name}
            className={`call-preview__tile${person.speaking ? ' is-speaking' : ''}`}
            style={{ '--hue': person.hue }}
          >
            <span className="call-preview__head" />
            <span className="call-preview__body" />
            <span className="call-preview__label">
              {person.name}
              {person.speaking && (
                <span className="call-preview__wave">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </span>
          </div>
        ))}
        <p className="call-preview__bubble">Link is in the chat, jump in!</p>
      </div>

      <div className="call-preview__controls">
        <span className="call-preview__ctl">
          <MicIcon />
        </span>
        <span className="call-preview__ctl">
          <CameraIcon />
        </span>
        <span className="call-preview__ctl">
          <ScreenShareIcon />
        </span>
        <span className="call-preview__ctl is-leave">
          <LeaveIcon />
        </span>
      </div>
    </div>
  )
}
