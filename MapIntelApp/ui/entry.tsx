import React from "react";
import { createRoot } from "react-dom/client";
import { NativeShell } from "./mobile";
import Prototype from "./Prototype";
import "./native.css";
createRoot(document.getElementById("root")!).render(
  <NativeShell>
    <Prototype />
  </NativeShell>,
);
