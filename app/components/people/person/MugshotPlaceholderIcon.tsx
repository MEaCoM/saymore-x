import * as React from "react";

export class MugshotPlaceholder extends React.Component {
  public render() {
    return (
      <img src="data:image/png;base64,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" />
    );
  }
}
