"use client"

import { useState, useEffect } from "react"

export type DeviceType = "desktop" | "tablet" | "mobile"

interface DeviceInfo {
  device: DeviceType
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  hasTouch: boolean
}

// Detect device type using User Agent + screen characteristics.
// This does NOT change when you resize a desktop browser window —
// it's based on the actual device, not the viewport width.
function detectDevice(): DeviceInfo {
  if (typeof window === "undefined") {
    return { device: "desktop", isMobile: false, isTablet: false, isDesktop: true, hasTouch: false }
  }

  const ua = navigator.userAgent.toLowerCase()
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0

  // Check for mobile devices first (phones)
  const isMobileUA = /android.*mobile|iphone|ipod|blackberry|opera mini|windows phone|mobile/i.test(ua)

  // Check for tablets (iPad, Android tablet, Surface)
  const isTabletUA = /ipad|android(?!.*mobile)|tablet|kindle|silk|playbook|surface/i.test(ua)

  // iPad Pro reports as Macintosh with touch — detect it
  const isMacWithTouch = /macintosh/.test(ua) && hasTouch && !/iphone|ipad/.test(ua)

  if (isMobileUA) {
    return { device: "mobile", isMobile: true, isTablet: false, isDesktop: false, hasTouch }
  }

  if (isTabletUA || isMacWithTouch) {
    return { device: "tablet", isMobile: false, isTablet: true, isDesktop: false, hasTouch }
  }

  return { device: "desktop", isMobile: false, isTablet: false, isDesktop: true, hasTouch }
}

export function useDevice(): DeviceInfo {
  // Use lazy initializer — device type doesn't change on resize
  const [deviceInfo] = useState<DeviceInfo>(() => detectDevice())

  // We intentionally do NOT update on resize — device type is determined
  // by the physical device (user agent + touch capability), not viewport size.
  // A desktop browser resized to 375px is still a desktop.
  // A mobile phone rotated to landscape is still mobile.

  return deviceInfo
}

// CSS breakpoint helper — for layout adjustments WITHIN a device category
export function useViewportSize() {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const update = () => setWidth(window.innerWidth)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  return {
    width,
    isSmall: width > 0 && width < 640,
    isMedium: width >= 640 && width < 1024,
    isLarge: width >= 1024,
  }
}
