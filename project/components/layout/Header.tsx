// import styles from './xxx.module.scss';
import Link from "next/link";

// type Props = {
//     // children: React.ReactNode;
// };

const Header = () => {
    return (
        <header className="bg-gray-200">
            <div className="flex gap-10 justify-between items-center px-5 py-5">
                <h1 className="text-3xl font-bold">Logo</h1>

                <ul className="flex gap-5">
                    <li className="">
                        <Link href="/" className="font-bold">HOME</Link>
                    </li>
                    <li className="">
                        <Link href="/user" className="font-bold">ユーザー一覧</Link>
                    </li>
                    <li className="">
                        <Link href="/project" className="font-bold">案件一覧</Link>
                    </li>
                </ul>
            </div>
        </header>
    );
};

export default Header;