import type { Register } from "claude-code";

export const register: Register = (on) => {
  on("ui.render", { component: "AbovePrompt" }, ($, e, next) => {
    if (e.surface !== "terminal" || e.props.hasSurvey) {
      return next(e);
    }
    const { Box, Text } = $.ui.resolve(e);
    const viewport = e.viewport?.columns ?? "none";
    return (
      <Box>
        <Text>{`telltale · maxRows=${e.props.maxRows} · viewport=${viewport}`}</Text>
      </Box>
    );
  });
};
