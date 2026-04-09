import { UserThoughtModel } from '../types';

/**
 * The Language Evolution Layer adapts UI text to fit the user's cognitive style.
 * This is a foundational implementation that can be expanded with more complex logic.
 */

export function adaptText(text: string, userModel: UserThoughtModel): string {
  const { preferredTone, preferredDensity } = userModel.communication;
  const { abstractionPreference, precisionPreference } = userModel.cognitiveStyle;

  let adapted = text;

  // Tone Adaptation
  if (preferredTone === 'measured' || preferredTone === 'sober') {
    adapted = adapted.replace(/Welcome back/g, 'Status: Operational');
    adapted = adapted.replace(/How can I help you today\?/g, 'Awaiting cognitive input.');
  } else if (preferredTone === 'warm' || preferredTone === 'supportive') {
    adapted = adapted.replace(/Status: Operational/g, 'Welcome back');
    adapted = adapted.replace(/Awaiting cognitive input\./g, 'How can I help you today?');
  }

  // Density Adaptation
  if (preferredDensity === 'distilled') {
    // Simplify complex phrases
    adapted = adapted.replace(/Journal Chamber/g, 'Journal');
    adapted = adapted.replace(/Evolutionary Trajectory/g, 'Evolution');
  } else if (preferredDensity === 'recursive' || preferredDensity === 'layered') {
    // Add nuance or depth
    adapted = adapted.replace(/Journal/g, 'Journal Chamber');
    adapted = adapted.replace(/Evolution/g, 'Evolutionary Trajectory');
  }

  // Cognitive Style Adaptation (Abstraction vs. Precision)
  if (abstractionPreference > 0.7) {
    adapted = adapted.replace(/Settings/g, 'Configuration');
    adapted = adapted.replace(/Profile/g, 'Identity Arc');
  } else if (precisionPreference > 0.7) {
    adapted = adapted.replace(/Configuration/g, 'Settings');
    adapted = adapted.replace(/Identity Arc/g, 'Profile');
  }

  return adapted;
}

/**
 * Hook-like utility for components to get adapted text.
 */
export const useAdaptedText = (userModel: UserThoughtModel) => {
  return (text: string) => adaptText(text, userModel);
};
