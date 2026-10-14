import { VIEWS } from '../views'
import { tip } from '../tip'

// The workspace's views as icons: the canvas, the code and the review, with the count of changes
// waiting on the review's. At the top of the side panel, and in the top bar while the panel is
// closed. `mode` is the view showing; onMode switches.
export default function ViewSwitch({ mode, onMode, toReview, className = '' }) {
  return (
    <div className={`view-switch ${className}`} role="tablist" aria-label="View">
      {VIEWS.map(([key, label, Icon, keys]) => (
        <button
          key={key}
          role="tab"
          className="icon-button"
          aria-selected={mode === key}
          {...tip(label, keys, 'bottom')}
          onClick={() => onMode(key)}
        >
          <Icon size={15} />
          {key === 'review' && toReview > 0 && (
            <span className="view-switch-count" aria-label={`${toReview} to review`}>
              {toReview}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
