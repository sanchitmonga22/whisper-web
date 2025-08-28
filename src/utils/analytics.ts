declare global {
  interface Window {
    gtag: (command: string, targetId: string, config?: any) => void;
  }
}

export const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, parameters);
  }
};

export const trackDemoInteraction = (action: string, details?: Record<string, any>) => {
  trackEvent('demo_interaction', {
    action,
    ...details,
  });
};

export const trackVoiceConversation = (
  provider: 'moonshine' | 'elevenlabs',
  action: 'started' | 'completed' | 'error',
  metadata?: Record<string, any>
) => {
  trackEvent('voice_conversation', {
    provider,
    action,
    ...metadata,
  });
};

export const trackPerformanceMetric = (
  metric: string,
  value: number,
  provider?: string
) => {
  trackEvent('performance_metric', {
    metric_name: metric,
    value,
    provider,
  });
};

export const trackFeatureUsage = (feature: string, details?: Record<string, any>) => {
  trackEvent('feature_usage', {
    feature_name: feature,
    ...details,
  });
};