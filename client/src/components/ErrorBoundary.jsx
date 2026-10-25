import { Component } from 'react'

// Without this, any render error unmounts the whole React tree and leaves a
// blank page - mid-call that looks like the app just died.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unexpected render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="error-boundary" role="alert">
        <h1>Something went wrong</h1>
        <p>Reloading the page will bring you back to your room.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
