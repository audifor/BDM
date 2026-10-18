import { Component, type ErrorInfo, type ReactNode } from 'react'
import './workspace-error-boundary.css'

interface Props {
  readonly app: string
  readonly onReturnHome: () => void
  readonly children: ReactNode
}
interface State {
  readonly error: Error | null
}

/** Contain errors inside the current app; never take down the whole Courtside desktop. */
export class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[BDM Courtside] Error opening application', this.props.app, error, info.componentStack)
  }

  render() {
    if (this.state.error === null) return this.props.children
    return <section className="ng-workspace-error" role="alert" data-ng-region="workspace-error">
      <h2>No se ha podido abrir {this.props.app}</h2>
      <p>{this.state.error.message || 'Error de ejecución'}</p>
      <button type="button" onClick={this.props.onReturnHome}>Volver a Inicio</button>
    </section>
  }
}
