import { Route } from "wouter";

// Export route components for code splitting
export const routes = {
  home: () => import("../pages/home"),
  stock: () => import("../pages/stock"),
  notFound: () => import("../pages/not-found"),
};

export default routes;