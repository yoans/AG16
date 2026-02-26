import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('AG16 crashed:', error, info.componentStack);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleClearAndReload = () => {
        try { localStorage.clear(); } catch (_) {}
        window.location.href = window.location.origin + window.location.pathname;
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    background: '#0a0818',
                    color: '#e0e0f0',
                    fontFamily: 'system-ui, sans-serif',
                    padding: '20px',
                    textAlign: 'center',
                }}>
                    <h1 style={{ fontSize: '2em', marginBottom: '8px', color: '#667eea' }}>
                        AG16
                    </h1>
                    <p style={{ fontSize: '1.1em', marginBottom: '24px', color: '#aaa' }}>
                        Something went wrong. The app crashed unexpectedly.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                            onClick={this.handleReload}
                            style={{
                                padding: '12px 24px',
                                fontSize: '1em',
                                background: '#667eea',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                            }}
                        >
                            Reload
                        </button>
                        <button
                            onClick={this.handleClearAndReload}
                            style={{
                                padding: '12px 24px',
                                fontSize: '1em',
                                background: 'transparent',
                                color: '#aaa',
                                border: '1px solid #444',
                                borderRadius: '8px',
                                cursor: 'pointer',
                            }}
                        >
                            Clear Data & Reload
                        </button>
                    </div>
                    {this.state.error && (
                        <pre style={{
                            marginTop: '24px',
                            padding: '12px',
                            background: '#111',
                            borderRadius: '6px',
                            fontSize: '0.75em',
                            color: '#f87171',
                            maxWidth: '600px',
                            overflow: 'auto',
                            textAlign: 'left',
                        }}>
                            {this.state.error.toString()}
                        </pre>
                    )}
                </div>
            );
        }
        return this.props.children;
    }
}
