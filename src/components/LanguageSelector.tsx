import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { availableLanguages } from "../i18n";
import CircleFlagsLangSv from "~icons/circle-flags/lang-sv";
import CircleFlagsLangNo from "~icons/circle-flags/lang-no";
import CircleFlagsLangEn from "~icons/circle-flags/lang-en";
import CircleFlagsLangEs from "~icons/circle-flags/lang-es";
import { JSX } from "react";

export default function LanguageSelector(props: {
    className?: string;
    currentLanguage: string;
    onChangeLanguage: (newLanguage: string) => void;
}) {
    const { t } = useTranslation();

    const languageFlags: Record<string, JSX.Element> = {
        sv: <CircleFlagsLangSv className='inline-block' />,
        no: <CircleFlagsLangNo className='inline-block' />,
        en: <CircleFlagsLangEn className='inline-block' />,
        es: <CircleFlagsLangEs className='inline-block' />,
    };

    return (
        <div className={props.className}>
            <Menu>
                <MenuButton className='flex items-center justify-center rounded-lg p-2 bg-blue text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all duration-200 mr-0'>
                    <div className='w-7 h-7'>
                        {languageFlags[props.currentLanguage]}
                    </div>
                </MenuButton>
                <MenuItems anchor='bottom end' className='text-right bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-2'>
                    {availableLanguages.map((language) => (
                        <MenuItem
                            key={language}
                            disabled={language === props.currentLanguage}
                        >
                            <button
                                className={`flex items-center justify-end block w-full text-right text-gray-700 dark:text-gray-300 data-[focus]:bg-blue-100 dark:data-[focus]:bg-blue-900/30 mb-1 px-2 py-1 rounded ${language === props.currentLanguage ? "font-bold" : ""}`}
                                onClick={() => props.onChangeLanguage(language)}
                            >
                                <span className='mr-2'>
                                    {languageFlags[language]}
                                </span>{" "}
                                {t(`language_selector.${language}`)}
                            </button>
                        </MenuItem>
                    ))}
                </MenuItems>
            </Menu>
        </div>
    );
}
