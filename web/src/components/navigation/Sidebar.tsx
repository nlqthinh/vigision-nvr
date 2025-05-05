import Logo from "../Logo";
import NavItem from "./NavItem";
import { Link } from "react-router-dom";
import GeneralSettings from "../menu/GeneralSettings";
import AccountSettings from "../menu/AccountSettings";
import useNavigation from "@/hooks/use-navigation";
import { useState } from 'react';

function Sidebar() {
//   const location = useLocation();
//   const basePath = useMemo(() => new URL(baseUrl).pathname, []);

  const navbarLinks = useNavigation();
//   const isRootMatch = useMatch("/");
//   const isBasePathMatch = useMatch(basePath);
  // State to handle hover
  const [hoveredItemId, setHoveredItemId] = useState(null);
  return (
    <aside className="left-o scrollbar-hidden absolute inset-y-0 z-10 flex w-[70px] flex-col justify-between overflow-y-auto bg-background py-4 px-1">
        {/* border-r border-secondary-highlight */}
                

        
        <span tabIndex={0} className="sr-only" />
        <div className="flex w-full flex-col items-center gap-0 items-stretch">
            <Link to="/">
                <Logo className="mb-6 p-2" />
            </Link>
            {navbarLinks.map((item) => {
                // const showCameraGroups =
                // (isRootMatch || isBasePathMatch) && item.id === 1;
     
                return (
                    <div key={item.id}
                        //  onMouseEnter={() => setHoveredItemId(item.id)}
                        //  onMouseLeave={() => setHoveredItemId(null)}
                         >
                        <NavItem
                            className={`mx-[0px] mb-1`}
                            item={item}
                            Icon={item.icon}
                        />
                        {/* {showCameraGroups && hoveredItemId === item.id && <CameraGroupSelector className="mb-4" />} */}
                    </div>
                );
            })}
        </div>
        <div className="mb-8 flex w-full flex-col items-center gap-0 items-stretch">
            <GeneralSettings className={`mx-[0px] mb-1`}/>
            <AccountSettings className={`mx-[0px] mb-1`} />
        </div>
    </aside>
);
}

export default Sidebar;
