import './PullRefreshIndicator.css';

export default function PullRefreshIndicator({
    distance,
    refreshing,
    label,
}: {
    distance: number;
    refreshing: boolean;
    label: string;
}) {
    return (
        <div
            className="pull-refresh-indicator"
            style={{ height: refreshing ? 40 : distance }}
            role={refreshing ? 'status' : undefined}
            aria-label={refreshing ? label : undefined}
            aria-hidden={refreshing ? undefined : true}
        >
            <span className={refreshing ? 'pull-refresh-spinner' : ''}>↻</span>
        </div>
    );
}
