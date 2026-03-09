// Haptic feedback wrapper — no-ops gracefully if library unavailable
declare const Haptics: any;

export const haptics = {
  light:   () => { try { Haptics?.impact?.({ style: 'light'   }); } catch {} },
  medium:  () => { try { Haptics?.impact?.({ style: 'medium'  }); } catch {} },
  heavy:   () => { try { Haptics?.impact?.({ style: 'heavy'   }); } catch {} },
  success: () => { try { Haptics?.notification?.({ type: 'success' }); } catch {} },
  warning: () => { try { Haptics?.notification?.({ type: 'warning' }); } catch {} },
  error:   () => { try { Haptics?.notification?.({ type: 'error'   }); } catch {} },
  select:  () => { try { Haptics?.selection?.(); } catch {} },
};
