const MENU_WIDTH = 188;
const MENU_HEIGHT = 106;

export function contextMenuPosition(x: number, y: number) {
    return {
        x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)),
        y: Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8)),
    };
}
