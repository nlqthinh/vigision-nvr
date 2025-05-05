import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { CameraGroupConfig } from '@/types/vigisionConfig';

type ScrollableTabsProps = {
  group: string | undefined,
  setGroup: (tab: string, isGroup: boolean) => void,
  tabs: [string, CameraGroupConfig][],
};
export default function ScrollableTabs({
  group,
  setGroup,
  tabs,
}: ScrollableTabsProps) {
  const tabsListRef = useRef<HTMLUListElement | null>(null);
  const [activeTab, setActiveTab] = useState<string>('default');
  const [leftArrowActive, setLeftArrowActive] = useState<boolean>(false);
  const [rightArrowActive, setRightArrowActive] = useState<boolean>(true);

  

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    setGroup(tab, group != "default");

  };

  const manageIcons = () => {
    if (!tabsListRef.current) return;

    const tabsList = tabsListRef.current;
    const maxScrollValue = tabsList.scrollWidth - tabsList.clientWidth - 20;

    setLeftArrowActive(tabsList.scrollLeft >= 20);
    setRightArrowActive(tabsList.scrollLeft < maxScrollValue);
  };

  useEffect(() => {
    if (tabsListRef.current) {
      tabsListRef.current.addEventListener('scroll', manageIcons);
      manageIcons();
    }
  }, []);

  const handleRightArrowClick = () => {
    if (tabsListRef.current) {
      tabsListRef.current.scrollLeft += 200;
      manageIcons();
    }
  };

  const handleLeftArrowClick = () => {
    if (tabsListRef.current) {
      tabsListRef.current.scrollLeft -= 200;
      manageIcons();
    }
  };

  return (
    <div className="max-w-full rounded overflow-hidden relative">
      <div
        className={`absolute inset-y-0 left-0 w-24 flex items-center justify-center bg-gradient-to-r from-background to-transparent cursor-pointer ${leftArrowActive ? 'flex' : 'hidden'}`}
        onClick={handleLeftArrowClick}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 text-white">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </div>
      <ul ref={tabsListRef} className="flex gap-4 p-3 m-0 list-none overflow-x-scroll no-scrollbar scroll-smooth">
          <Button
            className={
              group == "default"
                ? "bg-card-foreground/90 hover:bg-card-foreground text-card h-8 w-full px-3"
                : "h-8 w-full px-3"
                // ? "bg-secondary text-selected  focus:bg-opacity-60 h-8 w-full px-3"
                // : "bg-secondary text-secondary-foreground focus:bg-secondary focus:text-secondary-foreground h-8 w-full px-3"
            }
            size="xs"
            onClick={() => handleTabClick("default")}
            // onMouseEnter={() => (isDesktop ? showTooltip("default") : null)}
            // onMouseLeave={() => (isDesktop ? showTooltip(undefined) : null)}
          >
            {/* <MdHome className="size-4" /> */}
            All Cameras
          </Button>

        {tabs.map((tab) => (
          <li key={tab[0]}>
            <Button
              className={`h-8 w-full px-3 ${activeTab === tab[0] ? 'bg-card-foreground/90 hover:bg-card-foreground text-card' : ''}`}
              size="xs"
              onClick={() => handleTabClick(tab[0])}
              // onMouseEnter={() => (isDesktop ? showTooltip(name) : null)}
              // onMouseLeave={() =>
              //   isDesktop ? showTooltip(undefined) : null
              // }
            >
              {tab[1].display_name}
            </Button>
          </li>
        ))}
      </ul>
      <div
        className={`absolute inset-y-0 right-0 w-24 flex items-center justify-center bg-gradient-to-l from-background to-transparent cursor-pointer ${rightArrowActive ? 'flex' : 'hidden'}`}
        onClick={handleRightArrowClick}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 text-white">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </div>
  );
};

