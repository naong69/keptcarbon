"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, user, openLogin, openRegister, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [homeDropdownOpen, setHomeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("scrolled", scrolled);
  }, [scrolled]);

  useEffect(() => {
    document.body.classList.toggle("kc-mobile-nav-active", navOpen);
  }, [navOpen]);

  const closeNav = () => setNavOpen(false);
  const onLogout = () => {
    logout();
    closeNav();
    router.push("/");
  };

  return (
    <>
      <header id="header" className="header d-flex align-items-center fixed-top">
        <div className="container-fluid container-xl position-relative d-flex align-items-center">
          <Link href="/" className="logo d-flex align-items-center me-auto">
            <img src="/assets/img/keptcarbon-logo.png" alt="Kept Carbon Logo" style={{ height: "52px", width: "auto" }} />
          </Link>

          <nav id="navmenu" className="navmenu">
            {ready && user ? (
              <ul className="d-none d-xl-flex">
                <li className="dropdown">
                  <Link
                    href="/"
                    className={homeDropdownOpen ? "active" : ""}
                  >
                    <span onClick={closeNav}>หน้าแรก</span>
                    <i
                      className="bi bi-chevron-down toggle-dropdown"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setHomeDropdownOpen(!homeDropdownOpen);
                      }}
                    ></i>
                  </Link>
                  <ul className={homeDropdownOpen ? "dropdown-active" : ""}>
                    <li>
                      <a href="/#project-about" onClick={closeNav}>เกี่ยวกับโครงการ</a>
                    </li>
                    <li>
                      <a href="/#team" onClick={closeNav}>ทีมงานของเรา</a>
                    </li>
                    <li>
                      <a href="/#contact" onClick={closeNav}>ติดต่อเรา</a>
                    </li>
                  </ul>
                </li>
                <li>
                  <Link href="/dashboard" onClick={closeNav}>
                    แดชบอร์ด
                  </Link>
                </li>
                <li>
                  <Link href="/map-draw" onClick={closeNav}>
                    คำนวณคาร์บอน
                  </Link>
                </li>
              </ul>
            ) : (
              <ul className="d-none d-xl-flex">
                <li className="dropdown">
                  <Link
                    href="/"
                    className={homeDropdownOpen ? "active" : ""}
                  >
                    <span onClick={closeNav}>หน้าแรก</span>
                    <i
                      className="bi bi-chevron-down toggle-dropdown"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setHomeDropdownOpen(!homeDropdownOpen);
                      }}
                    ></i>
                  </Link>
                  <ul className={homeDropdownOpen ? "dropdown-active" : ""}>
                    <li>
                      <a href="/#project-about" onClick={closeNav}>เกี่ยวกับโครงการ</a>
                    </li>
                    <li>
                      <a href="/#team" onClick={closeNav}>ทีมงานของเรา</a>
                    </li>
                    <li>
                      <a href="/#contact" onClick={closeNav}>ติดต่อเรา</a>
                    </li>
                  </ul>
                </li>
                <li>
                  <Link href="/dashboard" onClick={closeNav}>
                    แดชบอร์ด
                  </Link>
                </li>
              </ul>
            )}
            <i
              className={`mobile-nav-toggle d-xl-none bi bi-list`}
              onClick={() => setNavOpen(true)}
            ></i>
          </nav>

          <div id="nav-buttons" className="d-flex align-items-center ms-3">
            {ready && user ? (
              <div className="position-relative" ref={dropdownRef}>
                <a
                  href="#"
                  className="d-flex align-items-center text-decoration-none"
                  onClick={(e) => {
                    e.preventDefault();
                    setDropdownOpen(!dropdownOpen);
                  }}
                >
                  {user.pictureUrl ? (
                    <img
                      src={user.pictureUrl}
                      alt={user.fullname}
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      className="d-flex align-items-center justify-content-center text-white"
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        backgroundColor: "var(--color-primary, #2d9e5f)",
                        fontWeight: "600",
                        fontSize: "16px",
                      }}
                    >
                      {(user.fullname?.[0] ?? "U").toUpperCase()}
                    </div>
                  )}
                </a>

                {dropdownOpen && (
                  <ul
                    className="dropdown-menu show dropdown-menu-end shadow"
                    style={{ position: "absolute", top: "100%", right: 0, marginTop: "10px", border: "none", borderRadius: "10px", minWidth: "160px" }}
                  >
                    <li>
                      <a
                        href="#"
                        className="dropdown-item d-flex align-items-center py-2"
                        onClick={(e) => {
                          e.preventDefault();
                          setDropdownOpen(false);
                          router.push("/my-plots");
                        }}
                      >
                        <i className="bi bi-map me-2 fs-5 text-secondary"></i> แปลงของฉัน
                      </a>
                    </li>
                    <li>
                      <a
                        href="#"
                        className="dropdown-item d-flex align-items-center py-2"
                        onClick={(e) => {
                          e.preventDefault();
                          setDropdownOpen(false);
                          router.push("/profile");
                        }}
                      >
                        <i className="bi bi-person me-2 fs-5 text-secondary"></i> โปรไฟล์
                      </a>
                    </li>
                    {user.role === "admin" && (
                      <>
                        <li><hr className="dropdown-divider my-1" /></li>
                        <li>
                          <a
                            href="#"
                            className="dropdown-item d-flex align-items-center py-2"
                            onClick={(e) => {
                              e.preventDefault();
                              setDropdownOpen(false);
                              router.push("/admin/users");
                            }}
                          >
                            <i className="bi bi-people me-2 fs-5 text-secondary"></i> จัดการผู้ใช้
                          </a>
                        </li>
                      </>
                    )}
                    <li><hr className="dropdown-divider my-1" /></li>
                    <li>
                      <a
                        className="dropdown-item d-flex align-items-center py-2 text-danger"
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setDropdownOpen(false);
                          onLogout();
                        }}
                      >
                        <i className="bi bi-box-arrow-right me-2 fs-5"></i> ออกจากระบบ
                      </a>
                    </li>
                  </ul>
                )}
              </div>
            ) : (
              <>
                <a
                  className="btn-getstarted"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    openLogin();
                  }}
                >
                  เข้าสู่ระบบ
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Custom Mobile Drawer */}
      <div className={`kc-mobile-drawer d-xl-none ${navOpen ? 'active' : ''}`}>
        <div className="drawer-overlay" onClick={closeNav}></div>
        <div className="drawer-panel">
          <div className="drawer-header">
            <div className="drawer-brand">
              <span className="brand-title">KeptCarbon</span>
            </div>
            <button className="drawer-close" onClick={closeNav}>
              <i className="bi bi-x"></i>
            </button>
          </div>

          <div className="drawer-body">
            <div className="drawer-nav-list">
              <Link href="/" className={`drawer-nav-item ${pathname === '/' ? 'active' : ''}`} onClick={closeNav}>
                <i className="bi bi-house"></i> หน้าแรก
              </Link>

              <div className="drawer-nav-category">เมนูหลัก</div>
              <Link href="/dashboard" className={`drawer-nav-item ${pathname === '/dashboard' ? 'active' : ''}`} onClick={closeNav}>
                <i className="bi bi-grid"></i> แดชบอร์ด
              </Link>
              <Link href="/map-draw" className={`drawer-nav-item ${pathname === '/map-draw' ? 'active' : ''}`} onClick={closeNav}>
                <i className="bi bi-map"></i> คำนวณคาร์บอน
              </Link>

              {ready && user && (
                <>
                  <div className="drawer-nav-category">ข้อมูลผู้ใช้</div>
                  <Link href="/profile" className={`drawer-nav-item ${pathname === '/profile' ? 'active' : ''}`} onClick={closeNav}>
                    <i className="bi bi-person-circle"></i> โปรไฟล์
                  </Link>
                  <Link href="/my-plots" className={`drawer-nav-item ${pathname === '/my-plots' ? 'active' : ''}`} onClick={closeNav}>
                    <i className="bi bi-map"></i> แปลงของฉัน
                  </Link>
                </>
              )}

              <div className="drawer-nav-category">ข้อมูลอ้างอิง</div>
              <Link href="/#project-about" className="drawer-nav-item" onClick={closeNav}>
                <i className="bi bi-file-earmark-text"></i> เกี่ยวกับโครงการ
              </Link>
              <Link href="/#team" className="drawer-nav-item" onClick={closeNav}>
                <i className="bi bi-person-badge"></i> ทีมงานของเรา
              </Link>
              <Link href="/#contact" className="drawer-nav-item" onClick={closeNav}>
                <i className="bi bi-chat-dots"></i> ติดต่อเรา
              </Link>

              {ready && user && user.role === "admin" && (
                <>
                  <div className="drawer-nav-category">สำหรับผู้ดูแลระบบ</div>
                  <Link href="/admin/users" className={`drawer-nav-item ${pathname === '/admin/users' ? 'active' : ''}`} onClick={closeNav}>
                    <i className="bi bi-people"></i> จัดการผู้ใช้
                  </Link>
                </>
              )}

              <div className="drawer-auth-actions">
                {ready && user ? (
                  <a href="#" className="drawer-nav-item" style={{ color: "#d9534f" }} onClick={(e) => { e.preventDefault(); onLogout(); }}>
                    <i className="bi bi-box-arrow-right" style={{ color: "#d9534f" }}></i> ออกจากระบบ
                  </a>
                ) : (
                  <a href="#" className="drawer-nav-item" style={{ color: "#2d9e5f" }} onClick={(e) => { e.preventDefault(); closeNav(); openLogin(); }}>
                    <i className="bi bi-box-arrow-in-right" style={{ color: "#2d9e5f" }}></i> เข้าสู่ระบบ
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="drawer-footer">
            <i className="bi bi-leaf-fill"></i>
            <div className="footer-title" style={{ fontSize: '13px', lineHeight: '1.5', color: '#6a7c70', textAlign: 'center' }}>
              แพลตฟอร์มภูมิสารสนเทศและปัญญาประดิษฐ์<br />
              เพื่อการจัดการสวนยางพารา
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
