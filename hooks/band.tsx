import type { ClientSurface } from "claude-code";

export function Band(props: unknown, surface: ClientSurface) {
  const { Text } = surface.elements;
  return <Text>telltale</Text>;
}
