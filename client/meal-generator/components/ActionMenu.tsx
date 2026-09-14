import './ActionMenu.css';

export type ActionMenuItem = {
    label: string;
    icon?: string;
    onClick: () => void;
    destructive?: boolean;
};

type ActionMenuProps = {
    items: ActionMenuItem[];
    open: boolean;
    onClose: () => void;
};

export default function ActionMenu({ items, open, onClose }: ActionMenuProps) {
    return (
        <div
            className={`action-menu-backdrop ${open ? 'open' : ''}`}
            onClick={onClose}
        >
            <div
                className="action-menu"
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="action-menu-items">
                    {items.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            className={`action-menu-item ${
                                item.destructive
                                    ? 'action-menu-item-destructive'
                                    : ''
                            }`}
                            onClick={item.onClick}
                        >
                            {item.icon && (
                                <span
                                    className="action-menu-icon"
                                >
                                    {item.icon}
                                </span>
                            )}

                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    className="action-menu-cancel"
                    onClick={onClose}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
